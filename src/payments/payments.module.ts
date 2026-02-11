import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../database/database.module";
import { AfriexModule } from "../afriex/afriex.module";
import { RedisModule } from "../redis/redis.module";
import { PaymentsService } from "./payments.service";
import { PaymentsProcessor } from "./processors/payments.processor";
import { QueuesModule } from "../queues/queues.module";
import { MessagingModule } from "../messaging/messaging.module";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AfriexModule,
    RedisModule,
    forwardRef(() => QueuesModule),
    forwardRef(() => MessagingModule),
  ],
  providers: [PaymentsService, PaymentsProcessor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
