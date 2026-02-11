import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NearService } from "./near.service";
import { NearController } from "./near.controller";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [ConfigModule, UsersModule],
  controllers: [NearController],
  providers: [NearService],
  exports: [NearService],
})
export class NearModule {}
