import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../database/database.module";
import { RedisModule } from "../redis/redis.module";
import { PaymentsService } from "./payments.service";
import { PaymentsProcessor } from "./processors/payments.processor";
import { QueuesModule } from "../queues/queues.module";
import { MessagingModule } from "../messaging/messaging.module";
import { MockPaymentService } from "../common/mock-payment.service";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    forwardRef(() => QueuesModule),
    forwardRef(() => MessagingModule),
  ],
  providers: [PaymentsService, PaymentsProcessor, MockPaymentService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
