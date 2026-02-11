import { Module, Global } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { RedisService } from "./redis.service";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: "REDIS_CLIENT",
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>("redis.url");
        if (url) {
          return new Redis(url);
        }
        return new Redis({
          host: configService.get<string>("redis.host") || "localhost",
          port: configService.get<number>("redis.port") || 6379,
          password: configService.get<string>("redis.password"),
        });
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [RedisService, "REDIS_CLIENT"],
})
export class RedisModule {}
