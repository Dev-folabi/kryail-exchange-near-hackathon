import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import { HashingService } from "./hashing.service";
import { RegisterDto } from "./dto/register.dto";

describe("AuthService", () => {
  let service: AuthService;
  let usersService: UsersService;
  let hashingService: HashingService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByPhone: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            updateRefreshHash: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue("mockToken"),
          },
        },
        {
          provide: HashingService,
          useValue: {
            hash: jest.fn().mockResolvedValue("hashedPin"),
            verify: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    hashingService = module.get<HashingService>(HashingService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("register", () => {
    it("should register a new user", async () => {
      const dto: RegisterDto = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phone: "1234567890",
        pin: "1234",
      };

      jest.spyOn(usersService, "findByPhone").mockResolvedValue(null);
      jest.spyOn(usersService, "create").mockResolvedValue({
        id: 1,
        ...dto,
        pinHash: "hashedPin",
      } as any);

      const result = await service.register(dto);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(usersService.create).toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("should return tokens for a valid user", async () => {
      const user = { id: 1, phone: "1234567890" };
      const result = await service.login(user);

      expect(result).toEqual({
        access_token: "mockToken",
        refresh_token: "mockToken",
      });
      expect(usersService.updateRefreshHash).toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    it("should return new tokens for a valid refresh token", async () => {
      const user = {
        id: 1,
        phone: "1234567890",
        jwtRefreshHash: "hashedToken",
      } as any;
      const refreshToken = "validToken";

      jest.spyOn(usersService, "findById").mockResolvedValue(user);
      jest.spyOn(hashingService, "verify").mockResolvedValue(true);

      const result = await service.refresh(user.id, refreshToken);

      expect(result).toEqual({
        access_token: "mockToken",
        refresh_token: "mockToken",
      });
      expect(hashingService.verify).toHaveBeenCalledWith(
        refreshToken,
        "hashedToken",
      );
    });

    it("should throw UnauthorizedException if user has no refresh hash", async () => {
      const user = { id: 1, phone: "1234567890", jwtRefreshHash: null } as any;
      jest.spyOn(usersService, "findById").mockResolvedValue(user);
      await expect(service.refresh(1, "token")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException if refresh token is invalid", async () => {
      const user = {
        id: 1,
        phone: "1234567890",
        jwtRefreshHash: "hashedToken",
      } as any;
      jest.spyOn(hashingService, "verify").mockResolvedValue(false);

      await expect(service.refresh(user, "invalidToken")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
