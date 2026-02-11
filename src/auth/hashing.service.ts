import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";

@Injectable()
export class HashingService {
  async hash(data: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(data, salt);
  }

  async verify(data: string, hash: string): Promise<boolean> {
    return bcrypt.compare(data, hash);
  }
}
