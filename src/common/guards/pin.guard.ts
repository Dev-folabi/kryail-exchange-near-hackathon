import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { HashingService } from "../../auth/hashing.service";
import { RequestWithUser } from "../interfaces/request-with-user.interface";

@Injectable()
export class PinGuard implements CanActivate {
  constructor(private hashingService: HashingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const pin =
      (request.headers["x-pin"] as string) ||
      (request.body as Record<string, unknown>)["pin"];

    if (!user || !user.pinHash) {
      throw new UnauthorizedException("Authentication required");
    }

    if (!pin || typeof pin !== "string") {
      throw new UnauthorizedException("PIN required");
    }

    const isValid = await this.hashingService.verify(pin, user.pinHash);
    if (!isValid) {
      throw new UnauthorizedException("Invalid PIN");
    }

    return true;
  }
}
