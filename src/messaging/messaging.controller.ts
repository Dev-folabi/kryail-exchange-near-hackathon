import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import express from "express";
import { ThrottlerGuard } from "@nestjs/throttler";
import { MessagingService } from "./messaging.service";
import { TwilioService } from "./twilio.service";
import * as messagingInterface from "./messaging.interface";
import * as Sentry from "@sentry/node";

@Controller("messaging")
export class MessagingController {
  private readonly logger = new Logger(MessagingController.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly twilioService: TwilioService,
  ) {}

  @Post("twilio")
  @UseGuards(ThrottlerGuard)
  async handleTwilioWebhook(
    @Req() req: express.Request,
    @Body() body: messagingInterface.TwilioIncoming,
  ): Promise<{ success: boolean }> {
    try {
      const signature = req.headers["x-twilio-signature"] as string;

      const protocol =
        (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const host =
        (req.headers["x-forwarded-host"] as string) || req.get("host");
      const url = `${protocol}://${host}${req.originalUrl}`;

      this.logger.debug(`Validating signature for URL: ${url}`);

      const isValid = this.twilioService.validateRequest(
        signature,
        url,
        req.body,
      );

      if (!isValid) {
        this.logger.warn(`Invalid Twilio signature for URL: ${url}`);
        throw new UnauthorizedException("Invalid signature");
      }

      this.logger.log(`Webhook received from ${body.From}: ${body.MessageSid}`);

      const reply = await this.messagingService.handleIncoming(
        body.From,
        body.Body,
        body.MediaUrl0,
      );

      await this.twilioService.sendMessage(body.From, reply);

      return { success: true };
    } catch (error) {
      this.logger.error("Webhook processing error:", error);

      Sentry.captureException(error, {
        tags: {
          service: "messaging",
          action: "webhook",
        },
        extra: {
          from: body?.From,
          messageSid: body?.MessageSid,
        },
      });

      return { success: false };
    }
  }
}
