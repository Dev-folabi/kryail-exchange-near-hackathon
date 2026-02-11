import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ImageKitService } from "./imagekit.service";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ImageKitService],
  exports: [ImageKitService],
})
export class CommonModule {}
