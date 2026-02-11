import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import { RedisService } from "../redis/redis.service";
import { createSign } from "crypto";

describe("WebhooksService", () => {
  let service: WebhooksService;
  let configService: ConfigService;

  // Generate a test RSA key pair for testing
  const testPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIICXAIBAAKBgQC7VJTUt9Us8cKjMzEfYyjiWA4R4ypbHrXwpqzdmwGWmV1K3ugj
STrxZJi7qL+sd2nGvuXoYNVei3mYMeqk2ivRC6c0JQ+NaGmy9bkNNEW6EZJUkX/0
3cJZKnKjvLwqCm90dD8j9QaBtpNh0m5a3xKGdPe7Awjz3Qn9B1vJLQIDAQABAoGA
Cy7XNUN91V0xH9riMN6HnZN+nLznV3pVpck3eLLfg8N4VJxAnQGdtVWgiQoKUmlw
xz6VA7hI5aJKczBSS/hCzVYPidHuFAaJTl0L5fKKWyoLVSDqnlpnYqH7eQ2101S+
gVBaMAh+ivYW4JuIpmxzniYgNbRoMhtzIP+vFQECQQDYy+RlTmwRD6hy7UtMjR0H
3CSRJnJNT3QqohPoeN8gFewRahxCtKmZUncL2+JZJxieCWXQkL0CQQDcAkEc6yy+
47DDh8VwkYo0Tsb+dzGJBUqH4YiREqCTAoGAd7wkKxW0v1qBZk67PTFgIgCrZehI
-----END RSA PRIVATE KEY-----`;

  const testPublicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC7VJTUt9Us8cKjMzEfYyjiWA4R
4ypbHrXwpqzdmwGWmV1K3ugjSTrxZJi7qL+sd2nGvuXoYNVei3mYMeqk2ivRC6c0
JQ+NaGmy9bkNNEW6EZJUkX/03cJZKnKjvLwqCm90dD8j9QaBtpNh0m5a3xKGdPe7
Awjz3Qn9B1vJLQIDAQAB
-----END PUBLIC KEY-----`;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "AFRIX_PUBLIC_KEY") {
        return testPublicKey;
      }
      return null;
    }),
  };

  const mockRedisService = {
    setIfNotExist: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("verifySignature", () => {
    it("should be defined", () => {
      expect(service).toBeDefined();
    });

    it("should return true for valid signature", () => {
      const rawBody = Buffer.from(
        JSON.stringify({
          event: "customer.created",
          data: { customerId: "cus_123" },
        }),
      );

      // Create a valid signature using the private key
      const sign = createSign("RSA-SHA256");
      sign.update(rawBody);
      const signature = sign.sign(testPrivateKey, "base64");

      const result = service.verifySignature(rawBody, signature);

      expect(result).toBe(true);
    });

    it("should return false for invalid signature", () => {
      const rawBody = Buffer.from(
        JSON.stringify({
          event: "customer.created",
          data: { customerId: "cus_123" },
        }),
      );

      const invalidSignature = "invalid_signature_base64";

      const result = service.verifySignature(rawBody, invalidSignature);

      expect(result).toBe(false);
    });

    it("should return false when signature is missing", () => {
      const rawBody = Buffer.from(
        JSON.stringify({
          event: "customer.created",
          data: { customerId: "cus_123" },
        }),
      );

      const result = service.verifySignature(rawBody, "");

      expect(result).toBe(false);
    });

    it("should return false when public key is not configured", () => {
      mockConfigService.get.mockReturnValue("");

      // Create new service instance with empty public key
      const serviceWithoutKey = new WebhooksService(
        configService as any,
        mockRedisService as any,
      );

      const rawBody = Buffer.from(
        JSON.stringify({
          event: "customer.created",
          data: { customerId: "cus_123" },
        }),
      );

      const result = serviceWithoutKey.verifySignature(
        rawBody,
        "any_signature",
      );

      expect(result).toBe(false);
    });

    it("should return false for tampered body", () => {
      const originalBody = Buffer.from(
        JSON.stringify({
          event: "customer.created",
          data: { customerId: "cus_123" },
        }),
      );

      // Create signature for original body
      const sign = createSign("RSA-SHA256");
      sign.update(originalBody);
      const signature = sign.sign(testPrivateKey, "base64");

      // Tamper with the body
      const tamperedBody = Buffer.from(
        JSON.stringify({
          event: "customer.created",
          data: { customerId: "cus_999" }, // Changed ID
        }),
      );

      const result = service.verifySignature(tamperedBody, signature);

      expect(result).toBe(false);
    });
  });

  describe("validateWebhookEvent", () => {
    it("should validate and return valid webhook event", () => {
      const body = {
        event: "transaction.updated",
        data: {
          transactionId: "txn_123",
          status: "completed",
        },
        timestamp: "2026-02-07T18:00:00Z",
      };

      const result = service.validateWebhookEvent(body);

      expect(result).toEqual(body);
      expect(result.event).toBe("transaction.updated");
      expect(result.data.transactionId).toBe("txn_123");
    });

    it("should add timestamp if missing", () => {
      const body = {
        event: "customer.created",
        data: { customerId: "cus_123" },
      };

      const result = service.validateWebhookEvent(body);

      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe("string");
    });

    it("should throw UnauthorizedException for invalid body", () => {
      const invalidBody = null;

      expect(() => service.validateWebhookEvent(invalidBody)).toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for missing event", () => {
      const body = {
        data: { customerId: "cus_123" },
      };

      expect(() => service.validateWebhookEvent(body)).toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for missing data", () => {
      const body = {
        event: "customer.created",
      };

      expect(() => service.validateWebhookEvent(body)).toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for invalid event type", () => {
      const body = {
        event: 123, // Should be string
        data: { customerId: "cus_123" },
      };

      expect(() => service.validateWebhookEvent(body)).toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for invalid data type", () => {
      const body = {
        event: "customer.created",
        data: "invalid_data", // Should be object
      };

      expect(() => service.validateWebhookEvent(body)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("checkIdempotency", () => {
    it("should return true for non-transaction events", async () => {
      const event: any = { event: "customer.created", data: {} };
      const result = await service.checkIdempotency(event);
      expect(result).toBe(true);
      expect(mockRedisService.setIfNotExist).not.toHaveBeenCalled();
    });

    it("should return true and set key if event is unique", async () => {
      const event: any = {
        event: "TRANSACTION.CREATED",
        data: { transactionId: "txn_123", status: "PENDING" },
      };
      mockRedisService.setIfNotExist.mockResolvedValue(true);

      const result = await service.checkIdempotency(event);

      expect(result).toBe(true);
      expect(mockRedisService.setIfNotExist).toHaveBeenCalledWith(
        "afriex:webhook:idempotency:txn_123:pending",
        "processed",
        86400,
      );
    });

    it("should return false if event is a duplicate", async () => {
      const event: any = {
        event: "TRANSACTION.UPDATED",
        data: { transactionId: "txn_123", status: "COMPLETED" },
      };
      mockRedisService.setIfNotExist.mockResolvedValue(false);

      const result = await service.checkIdempotency(event);

      expect(result).toBe(false);
    });
  });
});
