import { Strategy } from "passport-local";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService, UserWithoutSensitiveInfo } from "./auth.service";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: "phone",
      passwordField: "pin",
    });
  }

  async validate(
    phone: string,
    pin: string,
  ): Promise<UserWithoutSensitiveInfo> {
    const user = await this.authService.validateUser(phone, pin);
    if (!user) {
      throw new UnauthorizedException("Invalid phone or PIN");
    }
    return user;
  }
}
