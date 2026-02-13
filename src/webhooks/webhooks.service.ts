import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createVerify } from "crypto";
import * as Sentry from "@sentry/node";
import { WebhookEvent } from "./webhook.interface";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly publicKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.publicKey = this.configService.get<string>("WEBHOOK_PUBLIC_KEY") || "";

    if (!this.publicKey) {
      this.logger.warn(
        "WEBHOOK_PUBLIC_KEY not configured - signature verification will be skipped in dev/mock mode",
      );
    }
  }

  /**
   * Check if the webhook event has already been processed using Redis.
   * Only applies to TRANSACTION events.
   * @param event - The validated webhook event
   * @returns true if the event is unique, false if it's a duplicate
   */
  async checkIdempotency(event: WebhookEvent): Promise<boolean> {
    const { event: eventType, data } = event;

    if (
      !eventType.startsWith("TRANSACTION") &&
      !eventType.startsWith("transaction")
    ) {
      return true;
    }

    const transactionId = data?.transactionId || data?.id;
    const status = data?.status;

    if (!transactionId || !status) {
      this.logger.warn(
        `Missing transactionId or status in ${eventType} event for idempotency check`,
      );
      return true;
    }

    const lockKey = `webhook:idempotency:${transactionId}:${status.toLowerCase()}`;

    const isUnique = await this.redisService.setIfNotExist(
      lockKey,
      "processed",
      86400,
    );

    if (!isUnique) {
      this.logger.log(
        `Duplicate webhook detected for transaction ${transactionId} with status ${status}. Skipping.`,
      );
    }

    return isUnique;
  }

  /**
   * Verify webhook signature using RSA-SHA256
   * @param rawBody - Raw request body as Buffer
   * @param signature - Base64-encoded signature from x-webhook-signature header
   * @returns true if signature is valid, false otherwise
   */
  verifySignature(rawBody: Buffer, signature: string): boolean {
    try {
      // In development/mock mode, if no key is configured, skip verification
      if (!this.publicKey) {
        this.logger.debug(
          "Skipping signature verification (no public key configured)",
        );
        return true;
      }

      if (!signature) {
        this.logger.error("No signature provided in webhook request");
        return false;
      }

      const verifier = createVerify("SHA256");
      verifier.update(rawBody);

      const formattedKey = this.publicKey.replace(/\\n/g, "\n");

      const isValid = verifier.verify(
        formattedKey,
        Buffer.from(signature, "base64"),
      );

      if (!isValid) {
        this.logger.warn("Webhook signature verification failed");
        Sentry.captureMessage("Invalid webhook signature", {
          level: "warning",
          extra: {
            signature,
            bodyLength: rawBody.length,
          },
        });
      }

      return isValid;
    } catch (error) {
      this.logger.error("Error verifying webhook signature:", error);
      Sentry.captureException(error, {
        tags: {
          service: "webhooks",
          operation: "verifySignature",
        },
      });
      return false;
    }
  }

  /**
   * Validate webhook event structure
   */
  validateWebhookEvent(body: any): WebhookEvent {
    if (!body || typeof body !== "object") {
      throw new UnauthorizedException("Invalid webhook payload");
    }

    if (!body.event || typeof body.event !== "string") {
      throw new UnauthorizedException("Missing or invalid event type");
    }

    if (!body.data || typeof body.data !== "object") {
      throw new UnauthorizedException("Missing or invalid event data");
    }

    return {
      event: body.event,
      data: body.data,
      timestamp: body.timestamp || new Date().toISOString(),
    };
  }
}
