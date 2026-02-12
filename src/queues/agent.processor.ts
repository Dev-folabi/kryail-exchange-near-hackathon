import { Processor, Process } from "@nestjs/bull";
import { Logger, Inject } from "@nestjs/common";
import type { Job } from "bull";
import { NearService } from "../near/near.service";
import { QueuesService } from "./queues.service";
import * as databaseModule from "../database/database.module";
import { wallets } from "../database/schema/wallets.schema";
import { users } from "../database/schema/users.schema";
import { eq, and, sql } from "drizzle-orm";
import * as Sentry from "@sentry/node";

@Processor("agent-execution")
export class AgentProcessor {
  private readonly logger = new Logger(AgentProcessor.name);

  constructor(
    private readonly nearService: NearService,
    private readonly queuesService: QueuesService,
    @Inject(databaseModule.DRIZZLE) private db: databaseModule.DrizzleDB,
  ) {}

  @Process("execute-intent")
  async handleAgentExecution(job: Job) {
    const { agentId, intent, userId } = job.data;

    this.logger.log(`Processing agent execution job for user ${userId}`);

    try {
      // Execute via real Shade Agent
      const result = await this.nearService.executeIntentWithAgent(
        agentId,
        intent,
      );

      if (result.status === "failed") {
        throw new Error(result.error || "Agent execution failed");
      }

      // Handle balance updates based on intent type
      let finalAmount = intent.amount;
      if (intent.type === "inbound_remittance") {
        // Calculate final amount using current rate
        const quote = await this.nearService.getCrossBorderQuote(
          intent.amount,
          intent.source,
          intent.target,
        );
        finalAmount = quote.estimatedAmount;

        // Credit target currency (e.g. NGN)
        await this.updateWalletBalance(userId, finalAmount, "NGN");
      } else if (intent.type === "transfer") {
        // Debit source currency
        await this.updateWalletBalance(userId, -intent.amount, intent.source);
      }

      // Get user phone for notification
      const userPhone = await this.getUserPhone(userId);

      // Queue notification via BullMQ
      await this.queuesService.addNotificationToQueue({
        phone: userPhone,
        message: this.formatCompletionMessage(intent, result, finalAmount),
      });

      this.logger.log(
        `Agent execution completed successfully for user ${userId}`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Agent execution failed for user ${userId}:`, error);

      Sentry.captureException(error, {
        tags: { service: "agent", action: "execute_intent" },
        extra: { agentId, intent, userId },
      });

      // On final failure, notify user
      const attempts = job.opts?.attempts || 1;
      if (job.attemptsMade >= attempts) {
        const userPhone = await this.getUserPhone(userId);
        await this.queuesService.addNotificationToQueue({
          phone: userPhone,
          message: `❌ *Remittance Failed*\\n\\nYour agent encountered an error. Please try again or contact support.`,
        });
      }

      throw error; // Will trigger retry
    }
  }

  private async updateWalletBalance(
    userId: number,
    amount: number,
    currency: string,
  ): Promise<void> {
    try {
      // Check if wallet exists, if not create it
      const wallet = await this.db
        .select()
        .from(wallets)
        .where(
          and(eq(wallets.userId, userId), eq(wallets.asset, currency as any)),
        )
        .limit(1);

      if (!wallet || wallet.length === 0) {
        if (amount > 0) {
          await this.db.insert(wallets).values({
            userId,
            asset: currency as any,
            balance: amount.toString(),
          });
        }
      } else {
        await this.db
          .update(wallets)
          .set({
            balance: sql`balance + ${amount}`,
            updatedAt: new Date(),
          })
          .where(
            and(eq(wallets.userId, userId), eq(wallets.asset, currency as any)),
          );
      }

      this.logger.log(
        `Updated wallet balance for user ${userId}: +${amount} ${currency}`,
      );
    } catch (error) {
      this.logger.error("Error updating wallet balance:", error);
      // Don't throw - balance update failure shouldn't fail the job
    }
  }

  private async getUserPhone(userId: number): Promise<string> {
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return result[0]?.phone || "";
    } catch (error) {
      this.logger.error("Error getting user phone:", error);
      return "";
    }
  }

  private formatCompletionMessage(
    intent: any,
    result: any,
    finalAmount?: number,
  ): string {
    if (intent.type === "inbound_remittance") {
      const formattedAmount = new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
      }).format(finalAmount || 0);

      return (
        `✅ *Inbound Remittance Complete!*\\n\\n` +
        `Received: ${intent.amount} ${intent.source}\\n` +
        `Credited: ${formattedAmount}\\n` +
        `Transaction: ${result.txHash}\\n\\n` +
        `✨ Executed privately by your Shade Agent`
      );
    }

    return (
      `✅ *Transfer Complete!*\\n\\n` +
      `Sent: ${intent.amount} ${intent.source}\\n` +
      `Recipient: ${intent.recipient}\\n` +
      `Transaction: ${result.txHash}\\n\\n` +
      `✨ Executed privately by your Shade Agent`
    );
  }
}
