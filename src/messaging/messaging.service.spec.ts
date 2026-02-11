import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { MessagingService } from "./messaging.service";
import { LlmService } from "./llm.service";
import { SessionService } from "./session.service";
import { UsersService } from "../users/users.service";
import { AfriexService } from "../afriex/afriex.service";
import { HashingService } from "../auth/hashing.service";
import { PaymentsService } from "../payments/payments.service";
import { NotificationsService } from "./notifications.service";
import { ImageKitService } from "../common/imagekit.service";
import { NearService } from "../near/near.service";
import { DRIZZLE } from "../database/database.module";

// Mocks
const mockLlmService = {
  parseIntent: jest.fn(),
};

const mockSessionService = {
  getSession: jest.fn(),
  setSession: jest.fn(),
  updateSession: jest.fn(),
};

const mockUsersService = {
  findByPhone: jest.fn(),
  create: jest.fn(),
};

const mockAfriexService = {
  getVirtualAccount: jest.fn(),
  updateKyc: jest.fn(),
  getRates: jest.fn(),
  createCustomer: jest.fn(),
};

const mockHashingService = {
  hash: jest.fn(),
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

const mockPaymentsService = {
  startWithdrawal: jest.fn(),
  startSend: jest.fn(),
};

const mockNotificationsService = {
  sendWelcomeMessage: jest.fn(),
  sendPinRequest: jest.fn(),
  sendTransactionUpdate: jest.fn(),
};

const mockImagekitService = {
  uploadImage: jest.fn(),
  downloadMedia: jest.fn(),
};

const mockNearService = {
  getConnectDeepLink: jest.fn(),
  accountExists: jest.fn(),
  getAccountBalance: jest.fn(),
};

const mockDb = {
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn().mockResolvedValue([]),
    })),
  })),
  insert: jest.fn(() => ({
    values: jest.fn(() => ({
      returning: jest.fn().mockResolvedValue([{ id: 1 }]),
    })),
  })),
  update: jest.fn(() => ({
    set: jest.fn(() => ({
      where: jest.fn().mockResolvedValue({}),
    })),
  })),
  query: {
    users: {
      findFirst: jest.fn(),
    },
    transactions: {
      findFirst: jest.fn(),
    },
    wallets: {
      findFirst: jest.fn(),
    },
    paymentMethods: {
      findFirst: jest.fn(),
    },
  },
};

describe("MessagingService", () => {
  let service: MessagingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: LlmService, useValue: mockLlmService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AfriexService, useValue: mockAfriexService },
        { provide: HashingService, useValue: mockHashingService },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: ImageKitService, useValue: mockImagekitService },
        { provide: NearService, useValue: mockNearService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<MessagingService>(MessagingService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("handleIncoming", () => {
    it("should start onboarding for new user", async () => {
      mockUsersService.findByPhone.mockResolvedValue(null);
      mockSessionService.getSession.mockResolvedValue({});
      mockLlmService.parseIntent.mockResolvedValue(null); // Noextracted details

      const result = await service.handleIncoming(
        "whatsapp:+1234567890",
        "Hello",
      );

      expect(result).toContain("Welcome to Kryail");
      expect(mockUsersService.findByPhone).toHaveBeenCalledWith("+1234567890");
    });

    it("should continue onboarding if incomplete", async () => {
      mockUsersService.findByPhone.mockResolvedValue({
        hasCompletedOnboarding: false,
      });
      mockSessionService.getSession.mockResolvedValue({
        onboardingStep: "name",
      });
      mockLlmService.parseIntent.mockResolvedValue({
        extractedDetails: { firstName: "John", lastName: "Doe" },
      });

      const result = await service.handleIncoming(
        "whatsapp:+1234567890",
        "John Doe",
      );

      // Should skip to email
      expect(result).toContain("John");
      expect(result).toContain("email");
    });

    it("should handle deposit intent", async () => {
      mockUsersService.findByPhone.mockResolvedValue({
        id: 1,
        hasCompletedOnboarding: true,
      });
      mockSessionService.getSession.mockResolvedValue({
        isPinVerified: true, // Assuming PIN not needed for deposit info
      });
      mockLlmService.parseIntent.mockResolvedValue({
        intent: "deposit",
        currency: "NGN",
      });
      mockPaymentsService.startDeposit = jest
        .fn()
        .mockResolvedValue("Deposit info"); // Mock implementation if needed, but handleDeposit calls startDeposit

      // For handleDeposit, it calls startDeposit on paymentsService?
      // Wait, handleDeposit is in MessagingService, it calls paymentsService.startDeposit
      // Let's check MessagingService.handleDeposit logic.
      // It calls paymentsService.startDeposit.
      mockPaymentsService.startDeposit.mockResolvedValue(
        "Deposit instructions",
      );

      const result = await service.handleIncoming(
        "whatsapp:+1234567890",
        "deposit 5000",
      );

      // If handleDeposit calls paymentsService.startDeposit
      expect(mockPaymentsService.startDeposit).toHaveBeenCalled();
    });

    it("should handle rate intent", async () => {
      mockUsersService.findByPhone.mockResolvedValue({
        hasCompletedOnboarding: true,
      });
      mockSessionService.getSession.mockResolvedValue({});
      mockLlmService.parseIntent.mockResolvedValue({
        intent: "rate",
      });
      mockAfriexService.getRates.mockResolvedValue({
        rates: {
          USDT: { NGN: "1600" },
        },
        base: ["USDT"],
        updatedAt: 123456789,
      });

      const result = await service.handleIncoming(
        "whatsapp:+1234567890",
        "rate",
      );

      expect(result).toContain("Current Exchange Rates");
      expect(result).toContain("1 USDT = 1600 NGN");
      expect(mockAfriexService.getRates).toHaveBeenCalled();
    });

    it("should fallback to regex when LLM fails", async () => {
      mockUsersService.findByPhone.mockResolvedValue({
        id: 1,
        hasCompletedOnboarding: true,
      });
      mockSessionService.getSession.mockResolvedValue({});
      mockLlmService.parseIntent.mockResolvedValue(null); // LLM fails

      // Mock Payments service getBalance?
      // handleBalance uses paymentsService.getBalance usually?
      // Let's check handleBalance implementation.
      // It calls paymentsService.getBalance(user.id)

      // We need to mock getBalance on mockPaymentsService
      (mockPaymentsService as any).getBalance = jest
        .fn()
        .mockResolvedValue("Your Balances: NGN 5000");

      const result = await service.handleIncoming(
        "whatsapp:+1234567890",
        "balance",
      );

      expect(result).toContain("Your Balances");
      expect(mockLlmService.parseIntent).toHaveBeenCalled();
    });

    it("should handle help intent", async () => {
      mockUsersService.findByPhone.mockResolvedValue({
        hasCompletedOnboarding: true,
      });
      mockSessionService.getSession.mockResolvedValue({});
      mockLlmService.parseIntent.mockResolvedValue({ intent: "help" });

      const result = await service.handleIncoming(
        "whatsapp:+1234567890",
        "help",
      );

      expect(result).toContain("Kryail Help");
    });

    it("should handle unknown intent nicely", async () => {
      mockUsersService.findByPhone.mockResolvedValue({
        hasCompletedOnboarding: true,
      });
      mockSessionService.getSession.mockResolvedValue({});
      mockLlmService.parseIntent.mockResolvedValue({ intent: "unknown" });

      const result = await service.handleIncoming(
        "whatsapp:+1234567890",
        "blah blah",
      );

      expect(result).toContain("didn't quite catch that");
    });
  });
});
