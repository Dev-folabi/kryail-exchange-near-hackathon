import { Module, forwardRef } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { LlmService } from "./llm.service";
import { TwilioService } from "./twilio.service";
import { SessionService } from "./session.service";
import { NotificationsService } from "./notifications.service";
import { RedisModule } from "../redis/redis.module";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { AfriexModule } from "../afriex/afriex.module";
import { DatabaseModule } from "../database/database.module";
import { PaymentsModule } from "../payments/payments.module";
import { CommonModule } from "../common/common.module";

import { NotificationsProcessor } from "./processors/notifications.processor";
import { QueuesModule } from "../queues/queues.module";

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    HttpModule,
    RedisModule,
    AuthModule,
    UsersModule,
    AfriexModule,
    DatabaseModule,
    forwardRef(() => PaymentsModule),
    QueuesModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  ],
  controllers: [MessagingController],
  providers: [
    MessagingService,
    LlmService,
    TwilioService,
    SessionService,
    NotificationsService,
    NotificationsProcessor,
  ],
  exports: [MessagingService, NotificationsService],
})
export class MessagingModule {}
