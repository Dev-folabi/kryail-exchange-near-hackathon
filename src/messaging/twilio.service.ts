import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import * as twilio from "twilio";

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private readonly client: twilio.Twilio;
  private readonly whatsappNumber: string;
  private readonly authToken: string;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>("twilio.accountSid");
    this.authToken = this.configService.get<string>("twilio.authToken") || "";
    this.whatsappNumber =
      this.configService.get<string>("twilio.whatsappNumber") ||
      "whatsapp:+14155238886";

    this.client = twilio.default(accountSid, this.authToken);
  }

  /**
   * Send WhatsApp message via Twilio
   */
  async sendMessage(to: string, body: string): Promise<void> {
    try {
      // Ensure 'to' has whatsapp: prefix
      const formattedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

      const message = await this.client.messages.create({
        from: this.whatsappNumber,
        to: formattedTo,
        body,
      });

      this.logger.log(`Message sent to ${to}: ${message.sid}`);
    } catch (error) {
      this.logger.error(`Failed to send message to ${to}:`, error);

      Sentry.captureException(error, {
        tags: {
          service: "twilio",
          action: "send_message",
        },
        extra: {
          to,
          messageLength: body.length,
        },
      });

      throw error;
    }
  }

  /**
   * Validate Twilio webhook request signature
   */
  validateRequest(
    signature: string,
    url: string,
    params: Record<string, any>,
  ): boolean {
    try {
      return twilio.default.validateRequest(
        this.authToken,
        signature,
        url,
        params,
      );
    } catch (error) {
      this.logger.error("Signature validation error:", error);
      return false;
    }
  }
}
