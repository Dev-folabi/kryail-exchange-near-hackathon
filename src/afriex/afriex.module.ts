import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AfriexService } from "./afriex.service";

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        timeout: 30000,
        maxRedirects: 5,
        headers: {
          "x-api-key": configService.get<string>("AFRIX_API_KEY") || "",
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AfriexService],
  exports: [AfriexService],
})
export class AfriexModule {}
