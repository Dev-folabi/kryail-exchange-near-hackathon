import { Process, Processor } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import bull from "bull";
import { PaymentsService } from "../payments.service";

@Processor("payments")
export class PaymentsProcessor {
  private readonly logger = new Logger(PaymentsProcessor.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Process("process-transaction")
  async handleProcessTransaction(job: bull.Job) {
    this.logger.log(`Processing transaction job ${job.id}`);
    try {
      const event = job.data;

      if (event.event === "TRANSACTION.UPDATED") {
        if (event.data.type === "DEPOSIT") {
          await this.paymentsService.processDepositUpdate(event);
        } else if (event.data.type === "WITHDRAWAL") {
          await this.paymentsService.processWithdrawalUpdate(event);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process transaction job ${job.id}`, error);
      throw error;
    }
  }
}
