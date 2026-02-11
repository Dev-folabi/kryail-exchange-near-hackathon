import { Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import bull from "bull";
import { TwilioService } from "../twilio.service";

@Processor("notifications")
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly twilioService: TwilioService) {}

  @Process("notify-user")
  async handleNotifyUser(job: bull.Job) {
    const { phone, message } = job.data;
    this.logger.log(`Processing notification for ${phone}`);
    try {
      await this.twilioService.sendMessage(phone, message);
    } catch (error) {
      this.logger.error(`Failed to send notification to ${phone}`, error);
      throw error;
    }
  }
}
