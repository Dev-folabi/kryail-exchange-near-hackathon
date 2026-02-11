import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { eq, and } from "drizzle-orm";
import { AfriexService } from "../afriex/afriex.service";
import { RedisService } from "../redis/redis.service";
import { NotificationsService } from "../messaging/notifications.service";
import * as databaseModule from "../database/database.module";
import { CreateDepositDto } from "./dto/create-deposit.dto";
import { CreateWithdrawalDto } from "./dto/create-withdrawal.dto";
import { SendDto } from "./dto/send.dto";
import { users } from "../database/schema/users.schema";
import { wallets } from "../database/schema/wallets.schema";
import { transactions } from "../database/schema/transactions.schema";
import { paymentMethods } from "../database/schema/payment-methods.schema";
import { WebhookEvent, CryptoAsset } from "../afriex/afriex.interface";
import { generateReference } from "../common/utils/reference-generator.util";
import { QueuesService } from "../queues/queues.service";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly afriexService: AfriexService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => QueuesService))
    private readonly queuesService: QueuesService,
    @Inject(databaseModule.DRIZZLE) private db: databaseModule.DrizzleDB,
  ) {}

  async processWithdrawalUpdate(event: WebhookEvent): Promise<void> {
    this.logger.log(`Processing withdrawal update: ${event.event}`);
    const { id, status } = event.data;

    const [tx] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.afriexTxId, id));

    if (!tx) {
      this.logger.warn(`Transaction not found for withdrawal update: ${id}`);
      return;
    }

    if (tx.status === status) return;

    await this.db.transaction(async (trx) => {
      await trx
        .update(transactions)
        .set({ status: status as any, updatedAt: new Date() })
        .where(eq(transactions.id, tx.id));

      if (status === "failed" || status === "declined") {
        const [wallet] = await trx
          .select()
          .from(wallets)
          .where(
            and(
              eq(wallets.userId, tx.userId),
              eq(wallets.asset, tx.currency as any),
            ),
          );

        if (wallet) {
          const newBalance = (
            parseFloat(wallet.balance) + parseFloat(tx.amount)
          ).toString();
          await trx
            .update(wallets)
            .set({ balance: newBalance })
            .where(eq(wallets.id, wallet.id));

          this.logger.log(
            `Refunded ${tx.amount} ${tx.currency} to user ${tx.userId}`,
          );
        }
      }
    });

    // Send notification
    const statusMap: Record<string, "completed" | "failed" | "processing"> = {
      successful: "completed",
      completed: "completed",
      failed: "failed",
      declined: "failed",
      processing: "processing",
    };

    const mappedStatus = statusMap[status] || "processing";
    await this.notificationsService.sendTransactionUpdate(
      tx.userId,
      "withdrawal",
      mappedStatus,
      parseFloat(tx.amount),
      tx.currency,
    );
  }

  async handleTransactionUpdate(event: WebhookEvent): Promise<void> {
    const { type } = event.data;

    const txType = type?.toLowerCase();

    this.logger.log(
      `Handling transaction update: ${txType} (ID: ${event.data.id})`,
    );

    if (txType === "deposit" || txType === "collection") {
      await this.processDepositUpdate(event);
    } else if (
      txType === "withdrawal" ||
      txType === "payout" ||
      txType === "transfer"
    ) {
      await this.processWithdrawalUpdate(event);
    } else {
      this.logger.warn(`Unknown transaction type in webhook: ${type}`);
    }
  }

  async createTransactionRecord(event: WebhookEvent): Promise<void> {
    const { id, type, amount, currency, customerId, status } = event.data;
    this.logger.log(`Creating transaction record for ${type} ${id}`);

    const existingTx = await this.db.query.transactions.findFirst({
      where: eq(transactions.afriexTxId, id),
    });

    if (existingTx) {
      this.logger.log(`Transaction ${id} already exists. Skipping creation.`);
      return;
    }

    const user = await this.db.query.users.findFirst({
      where: eq(users.afriexCustomerId, customerId),
    });

    if (!user) {
      this.logger.error(`User with Afriex ID ${customerId} not found.`);
      return;
    }

    let txType = type.toLowerCase();
    if (txType === "collection") txType = "deposit";
    if (txType === "payout") txType = "withdrawal";

    await this.db.insert(transactions).values({
      userId: user.id,
      afriexTxId: id,
      type: txType as any,
      amount: amount.toString(),
      currency: currency,
      status: status as any,
      reference: generateReference("TX"),
      narration: `Afriex ${type} transaction`,
    });

    this.logger.log(`Created transaction record for ${id}`);
  }

  async startSend(userId: number, dto: SendDto): Promise<string> {
    const { amount, currency, target } = dto;
    this.logger.log(
      `Starting P2P send: ${amount} ${currency} to ${target} from ${userId}`,
    );

    const [senderWallet] = await this.db
      .select()
      .from(wallets)
      .where(
        and(eq(wallets.userId, userId), eq(wallets.asset, currency as any)),
      );

    if (!senderWallet || parseFloat(senderWallet.balance) < amount) {
      throw new Error(`Insufficient ${currency} balance.`);
    }

    const [recipient] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, target));
    if (!recipient) {
      throw new Error(`Recipient not found (ensure phone number is correct).`);
    }

    if (recipient.id === userId) {
      throw new Error(`Cannot send to yourself.`);
    }

    const [recipientWallet] = await this.db
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.userId, recipient.id),
          eq(wallets.asset, currency as any),
        ),
      );

    // 4. Exec Transaction
    await this.db.transaction(async (tx) => {
      let rWallet = recipientWallet;
      if (!rWallet) {
        this.logger.log(
          `Creating missing ${currency} wallet for recipient ${recipient.id}`,
        );
        [rWallet] = await tx
          .insert(wallets)
          .values({
            userId: recipient.id,
            asset: currency as any,
            balance: "0",
          })
          .returning();
      }

      // Debit Sender
      const newSenderBalance = (
        parseFloat(senderWallet.balance) - amount
      ).toString();
      await tx
        .update(wallets)
        .set({ balance: newSenderBalance })
        .where(eq(wallets.id, senderWallet.id));

      await tx.insert(transactions).values({
        userId: userId,
        type: "transfer_out",
        amount: amount.toString(),
        currency: currency,
        status: "completed",
        reference: generateReference("SEND"),
        narration: `Sent to ${recipient.firstName}`,
      });

      // Credit Recipient
      const newRecipientBalance = (
        parseFloat(rWallet.balance) + amount
      ).toString();
      await tx
        .update(wallets)
        .set({ balance: newRecipientBalance })
        .where(eq(wallets.id, rWallet.id));

      await tx.insert(transactions).values({
        userId: recipient.id,
        type: "transfer_in",
        amount: amount.toString(),
        currency: currency,
        status: "completed",
        reference: generateReference("RCV"),
        narration: `Received from sender`,
      });
    });

    // Notify sender and recipient
    await this.notificationsService.sendTransactionUpdate(
      userId,
      "send",
      "completed",
      amount,
      currency,
    );

    if (recipient.phone) {
      const message =
        `💰 *Transfer Received*\n\n` +
        `You received ${amount.toFixed(2)} ${currency} from ${recipient.firstName || "a Kryail user"}.\n\n` +
        `Type *balance* to check your updated balance.`;
      await this.notificationsService.sendTransactionUpdate(
        recipient.id,
        "send",
        "completed",
        amount,
        currency,
      );
    }

    return `✅ Successfully sent ${amount} ${currency} to ${recipient.firstName}.`;
  }

  async startDeposit(userId: number, dto: CreateDepositDto): Promise<string> {
    try {
      this.logger.log(`Starting deposit for user ${userId}`);

      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      if (!user) throw new Error("User not found");
      if (!user.hasCompletedOnboarding)
        throw new Error("Please complete onboarding first.");

      await this.ensureAfriexCustomer(user);

      const [updatedUser] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      if (!updatedUser.afriexCustomerId)
        throw new Error("User account not fully set up.");

      const isCrypto = ["USDT", "USDC"].includes(dto.currency);

      // 1. Check DB Cache
      const existingMethod = await this.db.query.paymentMethods.findFirst({
        where: and(
          eq(paymentMethods.userId, userId),
          isCrypto
            ? eq(paymentMethods.asset, dto.currency)
            : eq(paymentMethods.currency, dto.currency),
        ),
      });

      let accountDetails: any = existingMethod;

      if (!accountDetails) {
        // 2. Fetch from Afriex if not in cache
        if (isCrypto) {
          accountDetails = await this.afriexService.getCryptoWallet(
            dto.currency as CryptoAsset,
            user.afriexCustomerId!,
          );
          // Save to DB
          await this.db.insert(paymentMethods).values({
            userId,
            afriexPaymentMethodId: accountDetails.paymentMethodId,
            type: "crypto_wallet",
            asset: dto.currency,
            address: accountDetails.address,
            network: accountDetails.network,
            metadata: accountDetails,
          });
        } else {
          accountDetails = await this.afriexService.getVirtualAccount(
            dto.currency,
            user.afriexCustomerId!,
          );
          // Save to DB
          await this.db.insert(paymentMethods).values({
            userId,
            afriexPaymentMethodId: accountDetails.paymentMethodId,
            type: "virtual_account",
            currency: dto.currency,
            institutionName: accountDetails.institutionName,
            accountNumber: accountDetails.accountNumber,
            accountName: accountDetails.accountName,
            metadata: accountDetails,
          });
        }
      }

      // 3. Format Response
      if (isCrypto) {
        return (
          `🪙 *Deposit ${dto.currency}*\n\n` +
          `To deposit ${dto.currency}, send to the address below:\n\n` +
          `Address: ${accountDetails.address}\n` +
          `Network: ${accountDetails.network}\n\n` +
          `⚠️ *Only send ${dto.currency} via ${accountDetails.network} network*`
        );
      }

      return (
        `💰 *Deposit ${dto.currency}*\n\nTo deposit ${dto.currency}, transfer to:\n\n` +
        `Bank: ${accountDetails.institutionName}\n` +
        `Account Number: ${accountDetails.accountNumber}\n` +
        `Account Name: ${accountDetails.accountName}\n\n` +
        `Your funds will be credited automatically once received.`
      );
    } catch (error) {
      this.logger.error("Error starting deposit:", error);
      Sentry.captureException(error);
      throw error;
    }
  }

  async processDepositUpdate(event: WebhookEvent): Promise<void> {
    if (event.event !== "TRANSACTION.UPDATED") return;

    const txData = event.data;
    if (txData.status !== "successful" && txData.status !== "completed") return;

    const afriexTxId = txData.id;
    const amount = parseFloat(txData.amount);
    const currency = txData.currency;
    const afriexCustomerId = txData.customerId;

    this.logger.log(`Processing deposit webhook for tx: ${afriexTxId}`);

    const existingTx = await this.db.query.transactions.findFirst({
      where: eq(transactions.afriexTxId, afriexTxId),
    });

    if (existingTx && existingTx.status === "completed") {
      this.logger.log(
        `Transaction ${afriexTxId} already processed (Status: ${existingTx.status}).`,
      );
      return;
    }

    const user = await this.db.query.users.findFirst({
      where: eq(users.afriexCustomerId, afriexCustomerId),
    });

    if (!user) {
      this.logger.error(`User with Afriex ID ${afriexCustomerId} not found.`);
      return;
    }

    // Convert to USDT
    const rateResponse = await this.afriexService.getRates(
      ["USDT"],
      [currency],
    );
    const rate = parseFloat(rateResponse.rates["USDT"][currency] as any);

    const creditAmount = amount / rate;
    const assetToCredit = "USDT";

    await this.db.transaction(async (tx) => {
      let wallet = await tx.query.wallets.findFirst({
        where: and(
          eq(wallets.userId, user.id),
          eq(wallets.asset, assetToCredit),
        ),
      });

      if (!wallet) {
        [wallet] = await tx
          .insert(wallets)
          .values({
            userId: user.id,
            asset: assetToCredit,
            balance: "0",
          })
          .returning();
      }

      const newBalance = (parseFloat(wallet.balance) + creditAmount).toString();

      await tx
        .update(wallets)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));

      // 2. Insert or Update Transaction Record
      if (existingTx) {
        await tx
          .update(transactions)
          .set({
            status: "completed",
            amount: creditAmount.toString(),
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, existingTx.id));
      } else {
        await tx.insert(transactions).values({
          userId: user.id,
          afriexTxId: afriexTxId,
          type: "deposit",
          amount: creditAmount.toString(),
          currency: assetToCredit,
          status: "completed",
          reference: `DEP-${afriexTxId}`,
        });
      }
    });

    // Notify user of successful deposit
    await this.notificationsService.sendTransactionUpdate(
      user.id,
      "deposit",
      "completed",
      creditAmount,
      assetToCredit,
    );

    this.logger.log(
      `Deposit processed for user ${user.id}: +${creditAmount} ${assetToCredit}`,
    );
  }

  async getBalance(userId: number): Promise<string> {
    const userWallets = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId));

    if (!userWallets.length) {
      return "💼 *Your Balances*\n\nNo active wallets found.";
    }

    let message = "💼 *Your Balances*\n\n";
    for (const wallet of userWallets) {
      const bal = parseFloat(wallet.balance).toFixed(2);
      message += `${wallet.asset}: ${bal}\n`;
    }
    return message;
  }

  async startWithdrawal(
    userId: number,
    dto: CreateWithdrawalDto,
  ): Promise<string> {
    try {
      // 1. Get User and Check Balance
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      if (!user) throw new Error("User not found");

      // Ensure Afriex customer exists
      await this.ensureAfriexCustomer(user);

      const [updatedUser] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      if (!updatedUser.afriexCustomerId)
        throw new Error("User account not fully set up.");

      const [wallet] = await this.db
        .select()
        .from(wallets)
        .where(and(eq(wallets.userId, userId), eq(wallets.asset, dto.asset)));
      if (!wallet || parseFloat(wallet.balance) < dto.amount) {
        throw new Error(`Insufficient ${dto.asset} balance.`);
      }

      // 2. Get Quote if Cross-Border
      let amountToReceive = dto.amount;

      if ((dto.asset as string) !== (dto.currency as string)) {
        const rates = await this.afriexService.getRates(
          [dto.asset],
          [dto.currency],
        );
        const rate = parseFloat(rates.rates[dto.asset][dto.currency] as any);
        amountToReceive = dto.amount * rate;
        this.logger.log(
          "Quote: " +
            dto.amount +
            " " +
            dto.asset +
            " -> " +
            amountToReceive +
            " " +
            dto.currency +
            " @ " +
            rate,
        );
      }

      const pendingTxId = generateReference("WDR");

      if (!dto.destinationPaymentMethodId) {
        throw new Error(
          "Destination payment method ID is required for withdrawal.",
        );
      }

      // 3. Create Transaction on Afriex
      const afriexTx = await this.afriexService.createTransaction({
        customerId: user.afriexCustomerId!,
        destinationAmount: amountToReceive,
        currency: dto.currency,
        destinationId: dto.destinationPaymentMethodId,
        sourceCurrency: dto.asset,
        meta: { idempotencyKey: pendingTxId },
      });

      // 4. Debit Wallet (Hold) and Record Transaction
      await this.db.transaction(async (tx) => {
        const newBalance = (parseFloat(wallet.balance) - dto.amount).toString();
        await tx
          .update(wallets)
          .set({ balance: newBalance })
          .where(eq(wallets.id, wallet.id));

        await tx.insert(transactions).values({
          userId,
          afriexTxId: afriexTx.transactionId,
          type: "withdrawal",
          amount: dto.amount.toString(),
          currency: dto.asset,
          status: "pending",
          reference: pendingTxId,
        });
      });

      return "Withdrawal of " + dto.amount + " " + dto.asset + " initiated.";
    } catch (error) {
      this.logger.error("Error starting withdrawal:", error);
      throw error;
    }
  }

  private async ensureAfriexCustomer(user: any): Promise<void> {
    if (user.hasCreatedAfriex && user.afriexCustomerId) {
      return;
    }

    const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    if (!fullName) {
      this.logger.error(`User ${user.id} has no name. Auto-creation aborted.`);
      return;
    }

    this.logger.log(
      `Ensuring Afriex customer for user ${user.id} (${fullName})`,
    );

    try {
      const customer = await this.afriexService.createCustomer({
        fullName: fullName,
        email: user.email,
        phone: user.phone,
        countryCode: user.countryCode || "NG",
        meta: { source: "kryail_auto_create" },
      });

      if (customer && customer.customerId) {
        await this.db
          .update(users)
          .set({
            afriexCustomerId: customer.customerId,
            hasCreatedAfriex: true,
          })
          .where(eq(users.id, user.id));
        this.logger.log(`Auto-created Afriex customer for user ${user.id}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to auto-create Afriex customer for user ${user.id}`,
        error,
      );
      // We don't throw here, the calling method will check afriexCustomerId
    }
  }
}
