import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { eq } from "drizzle-orm";
import { LlmService } from "./llm.service";
import { SessionService } from "./session.service";
import { UsersService } from "../users/users.service";
import { AfriexService } from "../afriex/afriex.service";
import { HashingService } from "../auth/hashing.service";
import { PaymentsService } from "../payments/payments.service";
import { ParsedIntent, SessionData } from "./messaging.interface";
import { fallbackParse } from "./utils/fallback-parser.util";
import { formatErrorMessage } from "./utils/error-formatter.util";
import * as databaseModule from "../database/database.module";
import { users } from "../database/schema/users.schema";
import { CreateDepositDto } from "src/payments/dto/create-deposit.dto";
import { ImageKitService } from "../common/imagekit.service";
import { NearService } from "../near/near.service";
import { QueuesService } from "../queues/queues.service";

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly sessionService: SessionService,
    private readonly usersService: UsersService,
    private readonly afriexService: AfriexService,
    private readonly paymentsService: PaymentsService,
    private readonly hashingService: HashingService,
    private readonly configService: ConfigService,
    private readonly imagekitService: ImageKitService,
    private readonly nearService: NearService,
    private readonly queuesService: QueuesService,
    @Inject(databaseModule.DRIZZLE) private db: databaseModule.DrizzleDB,
  ) {}

  /**
   * Main entry point for handling incoming WhatsApp messages
   */
  async handleIncoming(
    from: string,
    body: string,
    mediaUrl?: string,
  ): Promise<string> {
    try {
      // Normalize phone number
      const phone = from.replace("whatsapp:", "").trim();

      this.logger.log(`Incoming message from ${phone}: ${body}`);

      // Get or create session
      let session = await this.sessionService.getSession(phone);
      if (!session) {
        session = {};
        await this.sessionService.setSession(phone, session);
      }

      // Check if user exists
      const user = await this.usersService.findByPhone(phone);

      // If no user, start onboarding
      if (!user) {
        return this.handleOnboarding(body, session, phone, null, mediaUrl);
      }

      // If user exists but hasn't completed onboarding, continue onboarding
      if (!user.hasCompletedOnboarding) {
        if (!session.onboardingStep && user.regStep) {
          session.onboardingStep = user.regStep as any;
          await this.sessionService.setSession(phone, session);
        }
        return this.handleOnboarding(body, session, phone, user, mediaUrl);
      }

      // Check if user is in PIN verification flow
      if (session.pendingAction && !session.isPinVerified) {
        return this.handlePinVerification(body, user, session, phone);
      }

      // Check if user is in PIN change flow
      if (session.pendingAction === "pin_change" && session.pinChangeStep) {
        return this.handlePinChange(body, user, session, phone);
      }

      // Parse intent (LLM first, fallback to regex)
      let intent = await this.llmService.parseIntent(body, session);

      if (!intent) {
        this.logger.warn("LLM parsing failed, using fallback parser");
        intent = fallbackParse(body);
      }

      // Update session with last intent
      await this.sessionService.updateSession(phone, {
        lastIntent: intent.intent,
      });

      // Route to appropriate handler
      return this.routeIntent(intent, user, session, phone, mediaUrl);
    } catch (error) {
      this.logger.error("Error handling incoming message:", error);

      Sentry.captureException(error, {
        tags: { service: "messaging", action: "handle_incoming" },
        extra: { from, body },
      });

      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Route intent to appropriate handler
   */
  private async routeIntent(
    intent: ParsedIntent,
    user: any,
    session: SessionData,
    phone: string,
    mediaUrl?: string,
  ): Promise<string> {
    switch (intent.intent) {
      case "deposit":
        return this.handleDeposit(intent, user);
      case "withdraw":
        return this.handleWithdraw(intent, user, session);
      case "balance":
        return this.handleBalance(user);
      case "send":
        return this.handleSend(intent, user, session);
      case "receive_inbound":
        return this.handleReceiveInbound(intent, user);
      case "set_pin":
        return this.handleSetPin(user, session, phone);
      case "help":
        return this.handleHelp();
      case "onboard":
        return this.handleOnboarding("", session, phone, user, mediaUrl);
      case "rate":
        return this.handleRate(intent);
      default:
        return this.handleUnknown();
    }
  }

  /**
   * Handle rate inquiry
   */
  private async handleRate(intent: ParsedIntent): Promise<string> {
    try {
      let base = ["USDT", "USDC"];
      let symbols = ["NGN", "USD", "GBP", "EUR", "CAD"];

      if (intent.currency) {
        base = [intent.currency];
        if (intent.target) {
          symbols = [intent.target];
        }
      }

      const response = await this.afriexService.getRates(base, symbols);

      let message = "💱 *Current Exchange Rates*\n\n";

      for (const baseCurrency of response.base) {
        const rates = response.rates[baseCurrency];
        if (rates) {
          for (const [symbol, rate] of Object.entries(rates)) {
            const formattedRate = parseFloat(
              rate as unknown as string,
            ).toString();
            message += `• 1 ${baseCurrency} = ${formattedRate} ${symbol}\n`;
          }
          message += "\n";
        }
      }

      message += "_Rates are updated in real-time._";
      return message;
    } catch (error) {
      this.logger.error("Rate handler error:", error);
      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Handle deposit intent - provide virtual account details
   */
  private async handleDeposit(
    intent: ParsedIntent,
    user: any,
  ): Promise<string> {
    try {
      const currency = (intent.currency?.toUpperCase() ||
        "NGN") as CreateDepositDto["currency"];

      return await this.paymentsService.startDeposit(user.id, {
        amount: intent.amount || 0,
        currency,
      });
    } catch (error) {
      this.logger.error("Deposit handler error:", error);
      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Handle withdraw intent - initiate withdrawal
   */
  private async handleWithdraw(
    intent: ParsedIntent,
    user: any,
    session: SessionData,
  ): Promise<string> {
    try {
      if (!intent.amount) {
        return 'How much would you like to withdraw? Please specify the amount and currency (e.g., "withdraw 5000 NGN")';
      }

      // Require PIN verification for withdrawals
      if (!session.isPinVerified) {
        // Store pending action and ask for PIN
        await this.sessionService.updateSession(user.phone, {
          pendingAction: "withdraw",
          pendingData: intent,
          isPinVerified: false,
        });
        return "🔐 *Security Verification*\n\nPlease enter your 4-digit PIN to confirm this withdrawal.";
      }

      const currency = intent.currency || "NGN";
      const asset = intent.sourceCurrency || "USDT";

      const result = await this.paymentsService.startWithdrawal(user.id, {
        amount: intent.amount,
        asset: asset as "USDT" | "USDC",
        currency: currency as "NGN" | "USD" | "GBP" | "EUR" | "CAD",
      });

      // Clear PIN verification after successful withdrawal
      await this.sessionService.updateSession(user.phone, {
        isPinVerified: false,
        pendingAction: undefined,
        pendingData: undefined,
      });

      return result;
    } catch (error) {
      this.logger.error("Withdraw handler error:", error);
      // Clear session on error
      await this.sessionService.updateSession(user.phone, {
        isPinVerified: false,
        pendingAction: undefined,
        pendingData: undefined,
      });
      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Handle receive inbound remittance intent - NEAR-based
   */
  private async handleReceiveInbound(
    intent: ParsedIntent,
    user: any,
  ): Promise<string> {
    try {
      // Validate user has completed onboarding
      if (!user.hasCompletedOnboarding) {
        return "Please complete onboarding first. Type 'onboard' to get started.";
      }

      // Validate user has NEAR wallet connected
      if (!user.nearAccountId) {
        return "Please connect your NEAR wallet first. Type 'onboard' to continue setup.";
      }

      // Validate amount and source currency
      if (!intent.amount || !intent.sourceCurrency) {
        return (
          "Please specify amount and currency.\\n\\n" +
          'Example: "receive 100 USD to NGN"'
        );
      }

      // Create NEAR intent
      const intentData = await this.nearService.createRemittanceIntent(
        user.id,
        intent,
        this.db,
      );

      // Spawn Shade Agent for user
      const agentInfo = await this.nearService.spawnShadeAgent(
        user.nearAccountId,
      );

      // Queue agent execution via BullMQ
      await this.queuesService.addAgentExecutionJob({
        agentId: agentInfo.agentId,
        intent: intentData,
        userId: user.id,
      });

      // Return privacy-focused confirmation message
      return (
        `🤖 *Your Private Shade Agent is Working*\\n\\n` +
        `Amount: ${intent.amount} ${intent.sourceCurrency} → ${intent.targetCurrency || "NGN"}\\n` +
        `Agent ID: ${agentInfo.agentId.substring(0, 20)}...\\n\\n` +
        `✨ Your agent executes this privately in TEE\\n` +
        `🔒 No central server sees your keys or balances\\n\\n` +
        `You'll be notified when complete.`
      );
    } catch (error) {
      this.logger.error("Receive inbound handler error:", error);
      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Handle balance inquiry
   */
  private async handleBalance(user: any): Promise<string> {
    try {
      return await this.paymentsService.getBalance(user.id);
    } catch (error) {
      this.logger.error("Balance handler error:", error);
      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Handle send intent - transfer to another user via NEAR
   */
  private async handleSend(
    intent: ParsedIntent,
    user: any,
    session: SessionData,
  ): Promise<string> {
    try {
      // Validate user has completed onboarding
      if (!user.hasCompletedOnboarding) {
        return "Please complete onboarding first. Type 'onboard' to get started.";
      }

      // Validate user has NEAR wallet connected
      if (!user.nearAccountId) {
        return "Please connect your NEAR wallet first. Type 'onboard' to continue setup.";
      }

      if (!intent.amount || !intent.target) {
        return (
          "To send funds, please specify the amount, currency, and recipient.\\n\\n" +
          'Example: "send 1000 NGN to +2348012345678" or "send 50 USDT to 0x..."'
        );
      }

      // Require PIN verification for sends
      if (!session.isPinVerified) {
        await this.sessionService.updateSession(user.phone, {
          pendingAction: "send",
          pendingData: intent,
          isPinVerified: false,
        });
        return "🔐 *Security Verification*\\n\\nPlease enter your 4-digit PIN to confirm this transfer.";
      }

      // Create NEAR intent
      const intentData = await this.nearService.createRemittanceIntent(
        user.id,
        intent,
        this.db,
      );

      // Spawn Shade Agent for user
      const agentInfo = await this.nearService.spawnShadeAgent(
        user.nearAccountId,
      );

      // Queue agent execution via BullMQ
      await this.queuesService.addAgentExecutionJob({
        agentId: agentInfo.agentId,
        intent: intentData,
        userId: user.id,
      });

      // Clear PIN verification after successful intent creation
      await this.sessionService.updateSession(user.phone, {
        isPinVerified: false,
        pendingAction: undefined,
        pendingData: undefined,
      });

      // Return privacy-focused confirmation message
      const currency = intent.targetCurrency || intent.currency || "NGN";
      return (
        `🤖 *Your Private Shade Agent is Working*\\n\\n` +
        `Amount: ${intent.amount} ${currency}\\n` +
        `Recipient: ${intentData.recipient}\\n` +
        `Agent ID: ${agentInfo.agentId.substring(0, 20)}...\\n\\n` +
        `✨ Your agent executes this privately in TEE\\n` +
        `🔒 No central server sees your keys or balances\\n\\n` +
        `You'll be notified when complete.`
      );
    } catch (error) {
      this.logger.error("Send handler error:", error);
      // Clear session on error
      await this.sessionService.updateSession(user.phone, {
        isPinVerified: false,
        pendingAction: undefined,
        pendingData: undefined,
      });
      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Handle onboarding flow: name → pin → confirm_pin → kyc
   */
  private async handleOnboarding(
    message: string,
    session: SessionData,
    phone: string,
    user: any,
    mediaUrl?: string,
  ): Promise<string> {
    try {
      if (!session.onboardingStep) {
        // Try to extract initial details if user provided them in first message
        const intent = await this.llmService.parseIntent(message, session);
        const extracted = intent?.extractedDetails;

        if (extracted) {
          const tempData = { ...session.tempData };
          if (extracted.firstName) tempData.firstName = extracted.firstName;
          if (extracted.lastName) tempData.lastName = extracted.lastName;
          if (extracted.email) tempData.email = extracted.email;

          // Determine starting step based on what we have
          let nextStep = "name";
          if (tempData.firstName) nextStep = "email";
          if (tempData.email) nextStep = "pin";

          await this.sessionService.updateSession(phone, {
            onboardingStep: nextStep as any,
            tempData,
          });

          if (nextStep === "email") {
            return `Nice to meet you, ${tempData.firstName}! \n\nPlease provide your email address.`;
          } else if (nextStep === "pin") {
            return (
              `Got it! Now, please set a 4-digit PIN to secure your account.\n\n` +
              `This PIN will be used to authorize transactions.`
            );
          }
        } else {
          await this.sessionService.updateSession(phone, {
            onboardingStep: "name",
          });
        }

        return "👋 Welcome to Kryail!\n\nTo get started, please tell me your full name.";
      }

      let messageContent = message;
      if (
        session.onboardingStep === "name" ||
        session.onboardingStep === "email" ||
        session.onboardingStep === "kyc"
      ) {
        const intent = await this.llmService.parseIntent(message, session);
        if (intent?.extractedDetails) {
          const { firstName, lastName, email, dob, country } =
            intent.extractedDetails;

          if (session.onboardingStep === "name" && firstName) {
            messageContent = `${firstName} ${lastName || ""}`;
          } else if (session.onboardingStep === "email" && email) {
            messageContent = email;
          } else if (session.onboardingStep === "kyc" && dob && country) {
            messageContent = `${dob} ${country}`;
          }
        }
      }

      const currentStep = session.onboardingStep;

      // Handle media if present (for KYC document)
      if (
        session.onboardingStep === "kyc_document" &&
        mediaUrl &&
        mediaUrl.startsWith("http")
      ) {
        messageContent = mediaUrl;
      }

      switch (currentStep) {
        case "name": {
          // Ask for name
          const lowerMessage = messageContent.trim().toLowerCase();
          const commonGreetings = [
            "hi",
            "hello",
            "hey",
            "hola",
            "greetings",
            "what's up",
            "sup",
            "good morning",
            "good afternoon",
            "good evening",
            "start",
            "onboard",
          ];

          if (commonGreetings.includes(lowerMessage)) {
            return "Please tell me your full name to continue with the registration.";
          }

          if (!messageContent || messageContent.trim().length < 2) {
            return "Please tell me your full name (at least 2 characters).";
          }

          // Store name in temp data
          const nameParts = messageContent.trim().split(" ");
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(" ") || firstName;

          await this.sessionService.updateSession(phone, {
            onboardingStep: "email",
            tempData: { firstName, lastName },
          });

          if (user) {
            await this.db
              .update(users)
              .set({ regStep: "email" })
              .where(eq(users.id, user.id));
          }

          return `Nice to meet you, ${firstName}! \n\nPlease provide your email address.`;
        }

        case "email": {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(messageContent.trim())) {
            return "Please enter a valid email address.";
          }

          await this.sessionService.updateSession(phone, {
            onboardingStep: "pin",
            tempData: { ...session.tempData, email: messageContent.trim() },
          });

          if (user) {
            await this.db
              .update(users)
              .set({ regStep: "pin" })
              .where(eq(users.id, user.id));
          }

          return (
            `Got it! Now, please set a 4-digit PIN to secure your account.\n\n` +
            `This PIN will be used to authorize transactions.`
          );
        }

        case "pin":
          // Validate and store PIN
          if (!/^\d{4}$/.test(message.trim())) {
            return "Please enter a valid 4-digit PIN (numbers only).";
          }

          await this.sessionService.updateSession(phone, {
            onboardingStep: "confirm_pin",
            tempData: { ...session.tempData, pin: message.trim() },
          });

          if (user) {
            await this.db
              .update(users)
              .set({ regStep: "confirm_pin" })
              .where(eq(users.id, user.id));
          }

          return "Please confirm your PIN by entering it again.";

        case "confirm_pin": {
          const storedPin = session.tempData?.pin;

          if (message.trim() !== storedPin) {
            return "PINs do not match. Please try again.";
          }

          // Create user if doesn't exist
          if (!user) {
            const pinHash = await this.hashingService.hash(storedPin);

            user = await this.usersService.create({
              firstName: session.tempData?.firstName,
              lastName: session.tempData?.lastName,
              email: session.tempData?.email,
              phone,
              pinHash,
              hasCompletedPin: true,
              hasCompletedOnboarding: false,
            });

            this.logger.log(`User created: ${user.id}`);
          }

          // Check if user has NEAR account connected
          if (!user.nearAccountId) {
            // Generate NEAR wallet connection deep link
            const deepLink = this.nearService.getConnectDeepLink(phone);

            await this.db
              .update(users)
              .set({ regStep: "near_connect" })
              .where(eq(users.id, user.id));

            await this.sessionService.updateSession(phone, {
              onboardingStep: "near_connect",
              tempData: { ...session.tempData, userId: user.id },
            });

            return (
              "✅ PIN set successfully!\\n\\n" +
              "🔗 *Connect Your NEAR Wallet*\\n\\n" +
              "To enable private, secure remittances on NEAR Protocol, please connect your NEAR testnet wallet:\\n\\n" +
              `${deepLink}\\n\\n` +
              "Click the link above to connect via MyNEARWallet. Once connected, we'll continue with identity verification."
            );
          }

          // If NEAR account already connected, proceed to KYC
          await this.db
            .update(users)
            .set({ regStep: "kyc" })
            .where(eq(users.id, user.id));

          await this.sessionService.updateSession(phone, {
            onboardingStep: "kyc",
            tempData: { ...session.tempData, userId: user.id },
          });

          return (
            "✅ PIN set successfully!\n\n" +
            "To complete your registration, we need to verify your identity (KYC).\n\n" +
            "This is a 2-step process:\n" +
            "1. Provide your details\n" +
            "2. Upload your ID document\n\n" +
            "*Step 1: Personal Details*\n" +
            "Please reply with your Date of Birth (DD/MM/YYYY) and Country of Residence.\n\n" +
            'Example: "15/03/1990 Nigeria"'
          );
        }

        case "near_connect": {
          // User is waiting for NEAR wallet connection
          // Check if they've connected (callback would have updated the DB)
          const updatedUser = await this.usersService.findByPhone(phone);

          if (updatedUser?.nearAccountId) {
            // Connection successful, move to KYC
            await this.db
              .update(users)
              .set({ regStep: "kyc" })
              .where(eq(users.id, updatedUser.id));

            await this.sessionService.updateSession(phone, {
              onboardingStep: "kyc",
            });

            return (
              "🎉 *Wallet Connected!*\\n\\n" +
              `Your NEAR account ${updatedUser.nearAccountId} is now linked.\\n\\n` +
              "Let's continue with identity verification.\\n\\n" +
              "*Step 1: Personal Details*\\n" +
              "Please reply with your Date of Birth (DD/MM/YYYY) and Country of Residence.\\n\\n" +
              'Example: "15/03/1990 Nigeria"'
            );
          }

          // Still waiting for connection
          const deepLink = this.nearService.getConnectDeepLink(phone);
          return (
            "⏳ *Waiting for Wallet Connection*\\n\\n" +
            "Please click the link below to connect your NEAR testnet wallet:\\n\\n" +
            `${deepLink}\\n\\n` +
            "Once you've connected, send any message to continue."
          );
        }

        case "kyc": {
          // Parse KYC info and update
          const kycMatch = messageContent.match(
            /(\d{2})\/(\d{2})\/(\d{4})\s+(.+)/,
          );

          if (!kycMatch) {
            return (
              "Invalid format.\n\n" +
              "*Step 1: Personal Details*\n" +
              "Please provide your Date of Birth (DD/MM/YYYY) and Country of Residence.\n\n" +
              'Example: "15/03/1990 Nigeria"'
            );
          }

          const [, day, month, year, country] = kycMatch;
          const formattedDob = `${year}-${month}-${day}`;

          // Simple country mapping
          const countryMap: { [key: string]: string } = {
            nigeria: "NG",
            ng: "NG",
            usa: "US",
            "united states": "US",
            uk: "GB",
            "united kingdom": "GB",
            ghana: "GH",
            kenya: "KE",
            "south africa": "ZA",
            canada: "CA",
          };

          const countryCode = countryMap[country.toLowerCase().trim()] || "NG";

          await this.sessionService.updateSession(phone, {
            onboardingStep: "kyc_document",
            tempData: {
              ...session.tempData,
              dob: formattedDob,
              countryCode,
              countryName: country,
            },
          });

          await this.db
            .update(users)
            .set({ regStep: "kyc_document" })
            .where(eq(users.id, user.id));

          return (
            "📄 *Step 2: Document Verification*\n\n" +
            "Almost done! Please upload a clear photo of your valid Government-issued ID (Passport, Driver's License, or National ID).\n\n" +
            "Ensure the details are clearly visible.\n" +
            "Simply tap the camera icon or attach an image to send it."
          );
        }

        case "kyc_document": {
          if (!messageContent.startsWith("http")) {
            return "Please upload an image of your ID document to continue.";
          }

          const imageUrl = messageContent;
          const fileName = `kyc_${user.id}_${Date.now()}.jpg`;

          // Get Twilio credentials for authenticated download
          const twilioSid = this.configService.get<string>("twilio.accountSid");
          const twilioAuthToken =
            this.configService.get<string>("twilio.authToken");
          const authHeader = `Basic ${Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString("base64")}`;

          let publicUrl = imageUrl;
          try {
            publicUrl = await this.imagekitService.uploadFromUrl(
              imageUrl,
              fileName,
              "kyc-documents",
              { Authorization: authHeader },
            );
          } catch (e) {
            this.logger.error("Failed to upload KYC doc", e);
            return "Failed to process image. Please try uploading again.";
          }

          const dob = session.tempData?.dob;
          const countryCode = session.tempData?.countryCode || "NG";
          const countryName = session.tempData?.countryName || "Nigeria";

          try {
            await this.db
              .update(users)
              .set({
                country: countryName,
                countryCode: countryCode,
              })
              .where(eq(users.id, user.id));

            const fullName =
              `${user.firstName || session.tempData?.firstName || ""} ${user.lastName || session.tempData?.lastName || ""}`.trim();

            if (!fullName) {
              throw new Error(
                "Customer name is required but not found in user or session.",
              );
            }

            const afriexCustomer = await this.afriexService.createCustomer({
              fullName: fullName,
              email: user.email || session.tempData?.email,
              phone: user.phone,
              countryCode: countryCode,
              kyc: {
                DATE_OF_BIRTH: dob,
                PASSPORT: publicUrl,
                COUNTRY: countryCode,
              },
              meta: {
                source: "kryail_whatsapp",
              },
            });

            await this.db
              .update(users)
              .set({
                hasCompletedOnboarding: true,
                hasCompletedKyc: true,
                regStep: "complete",
              })
              .where(eq(users.id, user.id));

            await this.sessionService.updateSession(phone, {
              onboardingStep: "complete",
            });

            return (
              "🎉 *Welcome to Kryail!*\n\n" +
              "Your account is now active with ID verification complete. Here's what you can do:\n\n" +
              "💰 *deposit* - Get account details to fund your wallet\n" +
              "💸 *withdraw* - Send money to your bank\n" +
              "type *help* for more."
            );
          } catch (err: any) {
            this.logger.error("Afriex creation error", err);
            return (
              "❌ *Account Creation Pending*\n\n" +
              "We've received your documents, but there was a slight issue setting up your account. \n\n" +
              "Please try sending a message again in a few minutes to retry the final step."
            );
          }
        }

        default:
          return this.handleHelp();
      }
    } catch (error) {
      this.logger.error("Onboarding handler error:", error);
      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Handle set PIN intent - initiate PIN change flow
   */
  private async handleSetPin(
    user: any,
    session: SessionData,
    phone: string,
  ): Promise<string> {
    try {
      // Start PIN change flow
      await this.sessionService.updateSession(phone, {
        pendingAction: "pin_change",
        pinChangeStep: "current",
      });

      return (
        "🔐 *Change PIN*\n\n" +
        "To change your PIN, please enter your current 4-digit PIN."
      );
    } catch (error) {
      this.logger.error("Set PIN handler error:", error);
      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Handle PIN verification for pending actions
   */
  private async handlePinVerification(
    pin: string,
    user: any,
    session: SessionData,
    phone: string,
  ): Promise<string> {
    try {
      // Validate PIN format
      if (!/^\d{4}$/.test(pin.trim())) {
        return "Invalid PIN format. Please enter a 4-digit PIN.";
      }

      // Verify PIN against user's stored hash
      const isValid = await this.hashingService.verify(
        pin.trim(),
        user.pinHash,
      );

      if (!isValid) {
        // Clear pending action on failed verification
        await this.sessionService.updateSession(phone, {
          isPinVerified: false,
          pendingAction: undefined,
          pendingData: undefined,
        });
        return "❌ Incorrect PIN. Transaction cancelled for security.\n\nPlease try again.";
      }

      // PIN verified - mark session and execute pending action
      await this.sessionService.updateSession(phone, {
        isPinVerified: true,
      });

      const { pendingAction, pendingData } = session;

      // Execute the pending action
      if (pendingAction === "withdraw") {
        return this.handleWithdraw(pendingData, user, {
          ...session,
          isPinVerified: true,
        });
      } else if (pendingAction === "send") {
        return this.handleSend(pendingData, user, {
          ...session,
          isPinVerified: true,
        });
      }

      return "Action completed successfully.";
    } catch (error) {
      this.logger.error("PIN verification error:", error);
      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Handle PIN change flow
   */
  private async handlePinChange(
    message: string,
    user: any,
    session: SessionData,
    phone: string,
  ): Promise<string> {
    try {
      const step = session.pinChangeStep;

      switch (step) {
        case "current": {
          if (!/^\d{4}$/.test(message.trim())) {
            return "Invalid PIN format. Please enter your current 4-digit PIN.";
          }

          const isValid = await this.hashingService.verify(
            message.trim(),
            user.pinHash,
          );

          if (!isValid) {
            await this.sessionService.updateSession(phone, {
              pendingAction: undefined,
              pinChangeStep: undefined,
            });
            return "❌ Incorrect current PIN. PIN change cancelled.\n\nPlease try again.";
          }

          // Move to new PIN step
          await this.sessionService.updateSession(phone, {
            pinChangeStep: "new",
          });

          return "✅ Current PIN verified.\n\nPlease enter your new 4-digit PIN.";
        }

        case "new":
          // Store new PIN temporarily
          if (!/^\d{4}$/.test(message.trim())) {
            return "Invalid PIN format. Please enter a 4-digit PIN (numbers only).";
          }

          await this.sessionService.updateSession(phone, {
            pinChangeStep: "confirm",
            tempData: { ...session.tempData, newPin: message.trim() },
          });

          return "Please confirm your new PIN by entering it again.";

        case "confirm":
          // Confirm and update PIN
          const newPin = session.tempData?.newPin;

          if (message.trim() !== newPin) {
            await this.sessionService.updateSession(phone, {
              pendingAction: undefined,
              pinChangeStep: undefined,
              tempData: undefined,
            });
            return "❌ PINs do not match. PIN change cancelled.\n\nPlease try again.";
          }

          // Hash and update PIN
          const newPinHash = await this.hashingService.hash(newPin);
          await this.db
            .update(users)
            .set({ pinHash: newPinHash })
            .where(eq(users.id, user.id));

          // Clear session
          await this.sessionService.updateSession(phone, {
            onboardingStep: undefined,
            pendingAction: undefined,
            pinChangeStep: undefined,
            tempData: undefined,
          });

          return (
            "✅ *PIN Changed Successfully!*\n\n" +
            "Your new PIN is now active. Please use it for future transactions."
          );

        default:
          return this.handleHelp();
      }
    } catch (error) {
      this.logger.error("PIN change error:", error);
      // Clear session on error
      await this.sessionService.updateSession(phone, {
        pendingAction: undefined,
        pinChangeStep: undefined,
        tempData: undefined,
      });
      return formatErrorMessage(error as Error);
    }
  }

  /**
   * Handle help intent
   */
  private handleHelp(): string {
    return (
      "❓ *Kryail Help*\n\n" +
      "Here's what I can help you with:\n\n" +
      "💰 *deposit* - Get account details to fund your wallet\n" +
      "💸 *withdraw [amount] [currency]* - Withdraw to your bank\n" +
      "💼 *balance* - Check your wallet balances\n" +
      "💱 *rate [currency]* - Check exchange rates\n" +
      "📤 *send [amount] [currency] to [phone]* - Transfer to another user\n" +
      "🔐 *set pin* - Change your PIN\n\n" +
      "Examples:\n" +
      '• "deposit NGN"\n' +
      '• "rate USDT"\n' +
      '• "withdraw 5000 NGN"\n' +
      '• "send 1000 NGN to +2348012345678"\n' +
      '• "balance"'
    );
  }

  /**
   * Handle unknown intent
   */
  private handleUnknown(): string {
    return (
      "I didn't quite catch that. Could you try rephrasing?\n\n" +
      "Type *help* to see what I can do for you."
    );
  }
}
