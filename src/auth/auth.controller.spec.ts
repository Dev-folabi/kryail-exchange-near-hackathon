import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { HashingService } from "./hashing.service";
import { RegisterDto } from "./dto/register.dto";

describe("AuthController", () => {
  let controller: AuthController;
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest
              .fn()
              .mockResolvedValue({ id: 1, phone: "1234567890" }),
            login: jest
              .fn()
              .mockResolvedValue({ access_token: "at", refresh_token: "rt" }),
            refresh: jest.fn().mockResolvedValue({ access_token: "at" }),
          },
        },
        {
          provide: HashingService,
          useValue: {
            hash: jest.fn().mockResolvedValue("hashed"),
            verify: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("register", () => {
    it("should register a user", async () => {
      const dto: RegisterDto = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phone: "1234567890",
        pin: "1234",
      };
      const result = await controller.register(dto);
      expect(result).toEqual({ id: 1, phone: "1234567890" });
      expect(service.register).toHaveBeenCalledWith(dto);
    });
  });

  describe("login", () => {
    it("should login a user", async () => {
      const req = { user: { id: 1, phone: "1234567890" } };
      const result = await controller.login(req);
      expect(result).toEqual({ access_token: "at", refresh_token: "rt" });
      expect(service.login).toHaveBeenCalledWith(req.user);
    });
  });
});
