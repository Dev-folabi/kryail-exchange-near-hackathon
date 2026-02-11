import {
  Controller,
  Post,
  Body,
  Headers,
  UseGuards,
  Logger,
  UnauthorizedException,
  Req,
} from "@nestjs/common";
import * as common from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Request } from "express";
import { WebhooksService } from "./webhooks.service";
import { QueuesService } from "../queues/queues.service";

@Controller("webhooks")
@UseGuards(ThrottlerGuard)
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly queuesService: QueuesService,
  ) {}

  @Post("afriex")
  async handleAfriexWebhook(
    @Req() req: common.RawBodyRequest<Request>,
    @Body() body: any,
    @Headers("x-webhook-signature") signature: string,
  ) {
    this.logger.log("Received Afriex webhook");

    // Get raw body for signature verification
    const rawBody = req.rawBody;

    if (!rawBody) {
      this.logger.error("Raw body not available for signature verification");
      throw new UnauthorizedException("Invalid request");
    }

    // Verify signature
    const isValid = this.webhooksService.verifySignature(rawBody, signature);

    if (!isValid) {
      throw new UnauthorizedException("Invalid signature");
    }

    // Validate event structure
    const webhookEvent = this.webhooksService.validateWebhookEvent(body);

    this.logger.log(`Valid webhook event: ${webhookEvent.event}`);

    // Check for idempotency (Transaction deduplication)
    const isUnique = await this.webhooksService.checkIdempotency(webhookEvent);

    if (!isUnique) {
      return { status: "ok", detail: "duplicate_ignored" };
    }

    // Add to BullMQ for async processing with retries
    await this.queuesService.addWebhookToQueue(webhookEvent);

    return { status: "ok" };
  }
}
