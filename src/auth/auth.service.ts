import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import { HashingService } from "./hashing.service";
import { RegisterDto } from "./dto/register.dto";
import { users } from "../database/schema/users.schema";

export type UserWithoutSensitiveInfo = Omit<
  typeof users.$inferSelect,
  "pinHash" | "jwtRefreshHash"
>;

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private hashingService: HashingService,
  ) {}

  async validateUser(
    phone: string,
    pin: string,
  ): Promise<UserWithoutSensitiveInfo | null> {
    const user = await this.usersService.findByPhone(phone);
    if (user && user.pinHash) {
      const isValid = await this.hashingService.verify(pin, user.pinHash);
      if (isValid) {
        const {
          pinHash: _pinHash,
          jwtRefreshHash: _jwtRefreshHash,
          ...result
        } = user;
        return result;
      }
    }
    return null;
  }

  async register(dto: RegisterDto): Promise<UserWithoutSensitiveInfo> {
    const { firstName, lastName, email, phone, pin } = dto;

    // Validate input
    if (!firstName || !lastName || !phone || !pin) {
      throw new BadRequestException("Missing required fields");
    }

    if (!/^\d{4}$/.test(pin)) {
      throw new BadRequestException("PIN must be 4 digits");
    }

    const existingUser = await this.usersService.findByPhone(phone);
    if (existingUser) {
      throw new BadRequestException("Phone number already registered");
    }
    const pinHash = await this.hashingService.hash(pin);

    const user = await this.usersService.create({
      firstName,
      lastName,
      email,
      phone,
      pinHash,
      hasCompletedPin: true,
    });

    const {
      pinHash: _pinHash,
      jwtRefreshHash: _jwtRefreshHash,
      ...result
    } = user;
    return result;
  }

  async login(user: UserWithoutSensitiveInfo) {
    return this.generateTokens(user);
  }

  async refresh(userId: number, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.jwtRefreshHash) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const isValid = await this.hashingService.verify(
      refreshToken,
      user.jwtRefreshHash,
    );

    if (!isValid) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return this.generateTokens(user);
  }

  async generateTokens(user: UserWithoutSensitiveInfo) {
    const payload = { sub: user.id, phone: user.phone };
    const accessToken = this.jwtService.sign(payload, { expiresIn: "15m" });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: "7d" });

    const refreshHash = await this.hashingService.hash(refreshToken);
    await this.usersService.updateRefreshHash(user.id, refreshHash);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }
}
