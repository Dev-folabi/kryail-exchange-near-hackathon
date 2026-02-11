import { Module, Global, forwardRef } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QueuesService } from "./queues.service";
import { WebhookProcessor } from "./webhook.processor";
import { UsersModule } from "../users/users.module";
import { PaymentsModule } from "../payments/payments.module";

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: "webhook-process",
    }),
    BullModule.registerQueue({
      name: "payments",
    }),
    BullModule.registerQueue({
      name: "notifications",
    }),
    UsersModule,
    forwardRef(() => PaymentsModule),
  ],
  providers: [QueuesService, WebhookProcessor],
  exports: [QueuesService, BullModule],
})
export class QueuesModule {}
