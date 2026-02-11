import { Test, TestingModule } from "@nestjs/testing";
import { PaymentsService } from "./payments.service";
import { ConfigService } from "@nestjs/config";
import { AfriexService } from "../afriex/afriex.service";
import { RedisService } from "../redis/redis.service";
import { ClientKafka } from "@nestjs/microservices";
import * as databaseModule from "../database/database.module";
import { getQueueToken } from "@nestjs/bull";
import { NotificationsService } from "../messaging/notifications.service";
import { QueuesService } from "../queues/queues.service";

// Mock dependencies
const mockAfriexService = {
  getVirtualAccount: jest.fn(),
  getRates: jest.fn(),
  createTransaction: jest.fn(),
};

const mockRedisService = {};

const mockQueue = {
  add: jest.fn(),
};

const mockNotificationsService = {
  sendTransactionUpdate: jest.fn(),
};

const mockQueuesService = {
  // Add methods as needed
};

const mockQueryBuilder = {
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  returning: jest.fn().mockResolvedValue([{ id: 1, balance: "100" }]),
  values: jest.fn().mockReturnThis(),
  then: jest.fn((resolve) => resolve([])), // Make it Thenable/awaitable
};

// Mock DB with chainable methods
const mockDb: any = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockResolvedValue([]), // Default resolve to empty array
  query: {
    transactions: {
      findFirst: jest.fn(),
    },
    users: {
      findFirst: jest.fn(),
    },
    wallets: {
      findFirst: jest.fn(),
    },
  },
  insert: jest.fn(() => mockQueryBuilder),
  update: jest.fn(() => mockQueryBuilder),
  // transaction calls callback with self (mockDb)
  transaction: jest.fn(async (cb) => await cb(mockDb)),
};

const mockKafkaClient = {
  emit: jest.fn(),
};

describe("PaymentsService", () => {
  let service: PaymentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: ConfigService, useValue: {} },
        { provide: AfriexService, useValue: mockAfriexService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: databaseModule.DRIZZLE, useValue: mockDb },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: QueuesService, useValue: mockQueuesService },
        { provide: getQueueToken("notifications"), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset default resolved value for where
    mockDb.where.mockResolvedValue([]);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("startDeposit", () => {
    it("should return deposit instructions", async () => {
      const mockUser = {
        id: 1,
        hasCompletedOnboarding: true,
      };
      const mockAccount = {
        institutionName: "Test Bank",
        accountNumber: "1234567890",
        accountName: "Kryail User",
      };

      mockDb.where.mockResolvedValue([mockUser]); // Setup find result
      mockAfriexService.getVirtualAccount.mockResolvedValue(mockAccount);

      const result = await service.startDeposit(1, {
        amount: 1000,
        currency: "NGN",
      });

      expect(result).toContain("Test Bank");
      expect(result).toContain("1234567890");
      expect(mockAfriexService.getVirtualAccount).toHaveBeenCalledWith("NGN");
    });

    it("should throw error if user not onboarded", async () => {
      const mockUser = { id: 1, hasCompletedOnboarding: false };
      mockDb.where.mockResolvedValue([mockUser]);

      await expect(
        service.startDeposit(1, { amount: 1000, currency: "NGN" }),
      ).rejects.toThrow(/complete onboarding/i);
    });
  });

  describe("startWithdrawal", () => {
    it("should initiate withdrawal if balance sufficient", async () => {
      const mockWallet = { id: 1, userId: 1, asset: "USDT", balance: "100" };
      mockDb.where.mockResolvedValue([mockWallet]);

      mockAfriexService.getRates.mockResolvedValue({
        rates: { USDT: { NGN: 1500 } },
      });

      const result = await service.startWithdrawal(1, {
        amount: 50,
        asset: "USDT",
        currency: "NGN",
      });
      expect(result).toContain("initiated");
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should throw error if insufficient balance", async () => {
      const mockWallet = { id: 1, userId: 1, asset: "USDT", balance: "10" };
      mockDb.where.mockResolvedValue([mockWallet]);

      await expect(
        service.startWithdrawal(1, {
          amount: 50,
          asset: "USDT",
          currency: "NGN",
        }),
      ).rejects.toThrow("Insufficient USDT balance");
    });
  });

  describe("processDepositWebhook", () => {
    it("should process valid deposit webhook", async () => {
      const event = {
        event: "TRANSACTION.UPDATED",
        data: {
          id: "tx_123",
          status: "completed",
          amount: "5000",
          currency: "NGN",
          paymentMethodId: "pm_123",
        },
      };

      mockDb.query.transactions.findFirst.mockResolvedValue(null);
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ userId: 1 }]),
      });

      mockDb.query.users.findFirst.mockResolvedValue({
        id: 1,
        phone: "123",
      });
      mockDb.query.wallets.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        asset: "USDT",
        balance: "0",
      });

      mockAfriexService.getRates.mockResolvedValue({
        rates: { USDT: { NGN: 1000 } },
      });

      await service.processDepositUpdate(event as any);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
      expect(
        mockNotificationsService.sendTransactionUpdate,
      ).toHaveBeenCalledWith(1, "deposit", "completed", 5, "USDT");
    });
  });

  describe("startSend", () => {
    it("should send funds to another user (P2P)", async () => {
      const senderId = 1;
      const recipientId = 2;
      const amount = 50;
      const currency = "USDT";

      mockDb
        .select()
        .from()
        .where.mockResolvedValueOnce([
          { id: 1, userId: senderId, asset: currency, balance: "100" },
        ]) // Sender Wallet
        .mockResolvedValueOnce([
          { id: recipientId, phone: "0987654321", firstName: "Jane" },
        ]) // Recipient User
        .mockResolvedValueOnce([
          { id: 2, userId: recipientId, asset: currency, balance: "10" },
        ]); // Recipient Wallet

      const result = await service.startSend(senderId, {
        amount,
        currency,
        target: "0987654321",
      });

      expect(result).toContain("Successfully sent");
      expect(mockDb.update).toHaveBeenCalledTimes(2); // Sender & Recipient wallet updates
      expect(mockDb.insert).toHaveBeenCalledTimes(2); // Two transaction records
      expect(
        mockNotificationsService.sendTransactionUpdate,
      ).toHaveBeenCalledTimes(2);
    });
  });
});
