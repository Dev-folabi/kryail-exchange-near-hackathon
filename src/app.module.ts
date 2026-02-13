import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import configuration from "./config/configuration";

import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { PaymentsModule } from "./payments/payments.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { RedisModule } from "./redis/redis.module";
import { MessagingModule } from "./messaging/messaging.module";
import { NearModule } from "./near/near.module";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { BullModule } from "@nestjs/bull";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: `.env.${process.env.NODE_ENV === "development" ? "dev" : process.env.NODE_ENV || "dev"}`,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>("redis.host");
        const port = configService.get<number>("redis.port");
        const password = configService.get<string>("redis.password");
        const url = configService.get<string>("redis.url");

        const useTls =
          host?.includes("upstash.io") || url?.startsWith("rediss://");

        return {
          redis: {
            host,
            port,
            password,
            tls: useTls ? {} : undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    DatabaseModule,
    AuthModule,
    PaymentsModule,
    WebhooksModule,
    RedisModule,
    MessagingModule,
    NearModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
