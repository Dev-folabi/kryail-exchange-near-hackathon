import { Process, Processor } from "@nestjs/bull";
import { Logger, Inject, forwardRef } from "@nestjs/common";
import bull from "bull";
import * as Sentry from "@sentry/node";
import { WebhookEvent } from "../webhooks/webhook.interface";
import { PaymentsService } from "../payments/payments.service";
import { UsersService } from "../users/users.service";

@Processor("webhook-process")
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
  ) {}

  @Process("process-webhook")
  async handleWebhook(job: bull.Job<WebhookEvent>) {
    const { event, data } = job.data;

    this.logger.log(`Processing webhook event: ${event} (Job ID: ${job.id})`);

    try {
      switch (event) {
        case "TRANSACTION.CREATED":
          await this.handleTransactionCreated(data);
          break;

        case "TRANSACTION.UPDATED":
          await this.handleTransactionUpdated(job.data);
          break;

        default:
          this.logger.warn(`Unknown webhook event type: ${event}`);
      }

      this.logger.log(`Successfully processed webhook: ${event}`);
    } catch (error) {
      this.logger.error(`Error processing webhook ${event}:`, error);

      // Log to Sentry
      Sentry.captureException(error, {
        tags: {
          service: "webhook-processor",
          event,
          jobId: job.id.toString(),
        },
        extra: {
          data,
          attemptsMade: job.attemptsMade,
        },
      });

      throw error;
    }
  }

  /**
   * Handle transaction.created event
   */
  private async handleTransactionCreated(data: any): Promise<void> {
    this.logger.debug("Handling transaction.created event", data);
    await this.paymentsService.createTransactionRecord({
      event: "TRANSACTION.CREATED",
      data,
    });
  }

  /**
   * Handle transaction.updated event
   */
  private async handleTransactionUpdated(event: WebhookEvent): Promise<void> {
    this.logger.debug("Handling transaction.updated event", event);
    await this.paymentsService.handleTransactionUpdate(event);
  }
}
