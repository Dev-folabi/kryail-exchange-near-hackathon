import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service";
import { UserWithoutSensitiveInfo } from "./auth.service";

export interface JwtPayload {
  sub: number;
  phone: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("jwt.secret")!,
    });
  }

  async validate(payload: JwtPayload): Promise<UserWithoutSensitiveInfo> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    const {
      pinHash: _pinHash,
      jwtRefreshHash: _jwtRefreshHash,
      ...result
    } = user;
    return result;
  }
}
