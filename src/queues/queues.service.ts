import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { WebhookEvent } from "../webhooks/webhook.interface";

@Injectable()
export class QueuesService {
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    @InjectQueue("webhook-process") private webhookQueue: Queue,
    @InjectQueue("notifications") private notificationsQueue: Queue,
    @InjectQueue("agent-execution") private agentExecutionQueue: Queue,
  ) {}

  /**
   * Add webhook event to processing queue
   */
  async addWebhookToQueue(event: WebhookEvent): Promise<void> {
    try {
      await this.webhookQueue.add(
        "process-webhook",
        {
          event: event.event,
          data: event.data,
          timestamp: event.timestamp,
        },
        {
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      this.logger.log(`Added webhook event to queue: ${event.event}`);
    } catch (error) {
      this.logger.error("Failed to add webhook to queue:", error);
      throw error;
    }
  }

  async addNotificationToQueue(data: any): Promise<void> {
    try {
      await this.notificationsQueue.add("notify-user", data, {
        attempts: 3,
        removeOnComplete: true,
      });
    } catch (error) {
      this.logger.error("Failed to add notification to queue:", error);
    }
  }

  /**
   * Add agent execution job to queue
   */
  async addAgentExecutionJob(data: any): Promise<void> {
    try {
      await this.agentExecutionQueue.add("execute-intent", data, {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });

      this.logger.log(`Added agent execution job for user: ${data.userId}`);
    } catch (error) {
      this.logger.error("Failed to add agent execution job:", error);
      throw error;
    }
  }
}
