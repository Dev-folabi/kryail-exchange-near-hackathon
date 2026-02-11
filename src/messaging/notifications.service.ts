import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { TwilioService } from "./twilio.service";
import { UsersService } from "../users/users.service";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly twilioService: TwilioService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  /**
   * Send transaction update notification
   */
  async sendTransactionUpdate(
    userId: number,
    type: "deposit" | "withdrawal" | "send",
    status: "pending" | "processing" | "completed" | "failed",
    amount: number,
    currency: string,
  ): Promise<void> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user || !user.phone) {
        this.logger.warn(`User ${userId} not found or has no phone number`);
        return;
      }

      let message = "";
      const formattedAmount = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);

      switch (status) {
        case "completed":
          if (type === "deposit") {
            message = `✅ *Deposit Confirmed*\n\nYour deposit of ${formattedAmount} ${currency} has been credited to your wallet.\n\nType *balance* to check your updated balance.`;
          } else if (type === "withdrawal") {
            message = `✅ *Withdrawal Completed*\n\nYour withdrawal of ${formattedAmount} ${currency} has been processed successfully.\n\nThe funds should arrive in your account shortly.`;
          } else if (type === "send") {
            message = `✅ *Transfer Completed*\n\nYou successfully sent ${formattedAmount} ${currency}.\n\nType *balance* to check your updated balance.`;
          }
          break;

        case "failed":
          if (type === "deposit") {
            message = `❌ *Deposit Failed*\n\nYour deposit of ${formattedAmount} ${currency} could not be processed.\n\nPlease contact support for assistance.`;
          } else if (type === "withdrawal") {
            message = `❌ *Withdrawal Failed*\n\nYour withdrawal of ${formattedAmount} ${currency} could not be processed.\n\nYour wallet has been refunded. Please try again or contact support.`;
          } else if (type === "send") {
            message = `❌ *Transfer Failed*\n\nYour transfer of ${formattedAmount} ${currency} could not be completed.\n\nPlease try again or contact support.`;
          }
          break;

        case "processing":
          if (type === "withdrawal") {
            message = `⏳ *Withdrawal Processing*\n\nYour withdrawal of ${formattedAmount} ${currency} is being processed.\n\nYou'll be notified when it's complete.`;
          }
          break;

        default:
          return;
      }

      if (message) {
        await this.twilioService.sendMessage(user.phone, message);
        this.logger.log(
          `Notification sent to user ${userId} for ${type} ${status}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send notification to user ${userId}:`,
        error,
      );
    }
  }

  /**
   * Send welcome message after onboarding
   */
  async sendWelcomeMessage(phone: string, firstName: string): Promise<void> {
    try {
      const message =
        `🎉 *Welcome to Kryail, ${firstName}!*\n\n` +
        `Your account is now fully activated. Here's what you can do:\n\n` +
        `💰 *deposit* - Fund your wallet\n` +
        `💸 *withdraw* - Send money to your bank\n` +
        `💼 *balance* - Check your balances\n` +
        `💱 *rate* - Check exchange rates\n` +
        `📤 *send* - Transfer to another user\n\n` +
        `Type any command to get started!`;

      await this.twilioService.sendMessage(phone, message);
      this.logger.log(`Welcome message sent to ${phone}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome message to ${phone}:`, error);
    }
  }

  /**
   * Send PIN verification request
   */
  async sendPinRequest(phone: string, action: string): Promise<void> {
    try {
      const message = `🔐 *Security Verification*\n\nPlease enter your 4-digit PIN to confirm this ${action}.`;

      await this.twilioService.sendMessage(phone, message);
      this.logger.log(`PIN request sent to ${phone} for ${action}`);
    } catch (error) {
      this.logger.error(`Failed to send PIN request to ${phone}:`, error);
    }
  }
}
