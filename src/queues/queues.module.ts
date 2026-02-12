import { Module, Global, forwardRef } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QueuesService } from "./queues.service";
import { WebhookProcessor } from "./webhook.processor";
import { AgentProcessor } from "./agent.processor";
import { UsersModule } from "../users/users.module";
import { PaymentsModule } from "../payments/payments.module";
import { NearModule } from "../near/near.module";

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
    BullModule.registerQueue({
      name: "agent-execution",
    }),
    UsersModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => NearModule),
  ],
  providers: [QueuesService, WebhookProcessor, AgentProcessor],
  exports: [QueuesService, BullModule],
})
export class QueuesModule {}
