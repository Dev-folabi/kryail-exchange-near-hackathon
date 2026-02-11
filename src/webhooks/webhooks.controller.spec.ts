import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { ConfigService } from "@nestjs/config";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { EventsService } from "../events/events.service";
import { QueuesService } from "../queues/queues.service";
import { RedisService } from "../redis/redis.service";
import { ThrottlerModule } from "@nestjs/throttler";
import { createSign } from "crypto";

describe("WebhooksController (Integration)", () => {
  let app: INestApplication;
  let webhooksService: WebhooksService;
  let eventsService: EventsService;
  let queuesService: QueuesService;

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

  const mockEventsService = {
    publishWebhookEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueuesService = {
    addWebhookToQueue: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60000,
            limit: 100,
          },
        ]),
      ],
      controllers: [WebhooksController],
      providers: [
        WebhooksService,
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
        {
          provide: QueuesService,
          useValue: mockQueuesService,
        },
        {
          provide: RedisService,
          useValue: {
            setIfNotExist: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "AFRIX_PUBLIC_KEY") {
                return `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC7VJTUt9Us8cKjMzEfYyjiWA4R
4ypbHrXwpqzdmwGWmV1K3ugjSTrxZJi7qL+sd2nGvuXoYNVei3mYMeqk2ivRC6c0
JQ+NaGmy9bkNNEW6EZJUkX/03cJZKnKjvLwqCm90dD8j9QaBtpNh0m5a3xKGdPe7
Awjz3Qn9B1vJLQIDAQAB
-----END PUBLIC KEY-----`;
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({
      rawBody: true,
    });
    await app.init();

    webhooksService = moduleFixture.get<WebhooksService>(WebhooksService);
    eventsService = moduleFixture.get<EventsService>(EventsService);
    queuesService = moduleFixture.get<QueuesService>(QueuesService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /webhooks/afriex", () => {
    it("should return 200 for valid webhook with correct signature", async () => {
      const webhookBody = {
        event: "transaction.updated",
        data: {
          transactionId: "txn_123",
          status: "completed",
        },
        timestamp: "2026-02-07T18:00:00Z",
      };

      const rawBody = Buffer.from(JSON.stringify(webhookBody));
      const sign = createSign("RSA-SHA256");
      sign.update(rawBody);
      const signature = sign.sign(testPrivateKey, "base64");

      const response = await request(app.getHttpServer())
        .post("/webhooks/afriex")
        .set("x-webhook-signature", signature)
        .set("Content-Type", "application/json")
        .send(webhookBody);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ status: "ok" });
      expect(mockEventsService.publishWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "transaction.updated",
          data: webhookBody.data,
        }),
      );
      expect(mockQueuesService.addWebhookToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "transaction.updated",
          data: webhookBody.data,
        }),
      );
    });

    it("should return 401 for invalid signature", async () => {
      const webhookBody = {
        event: "customer.created",
        data: {
          customerId: "cus_123",
        },
      };

      const response = await request(app.getHttpServer())
        .post("/webhooks/afriex")
        .set("x-webhook-signature", "invalid_signature")
        .set("Content-Type", "application/json")
        .send(webhookBody);

      expect(response.status).toBe(401);
      expect(mockEventsService.publishWebhookEvent).not.toHaveBeenCalled();
      expect(mockQueuesService.addWebhookToQueue).not.toHaveBeenCalled();
    });

    it("should return 401 for missing signature", async () => {
      const webhookBody = {
        event: "customer.created",
        data: {
          customerId: "cus_123",
        },
      };

      const response = await request(app.getHttpServer())
        .post("/webhooks/afriex")
        .set("Content-Type", "application/json")
        .send(webhookBody);

      expect(response.status).toBe(401);
    });

    it("should return 401 for invalid event structure", async () => {
      const webhookBody = {
        // Missing 'event' field
        data: {
          customerId: "cus_123",
        },
      };

      const rawBody = Buffer.from(JSON.stringify(webhookBody));
      const sign = createSign("RSA-SHA256");
      sign.update(rawBody);
      const signature = sign.sign(testPrivateKey, "base64");

      const response = await request(app.getHttpServer())
        .post("/webhooks/afriex")
        .set("x-webhook-signature", signature)
        .set("Content-Type", "application/json")
        .send(webhookBody);

      expect(response.status).toBe(401);
      expect(mockEventsService.publishWebhookEvent).not.toHaveBeenCalled();
    });

    it("should handle all webhook event types", async () => {
      const eventTypes = [
        "customer.created",
        "customer.updated",
        "customer.deleted",
        "payment_method.created",
        "payment_method.updated",
        "payment_method.deleted",
        "transaction.created",
        "transaction.updated",
      ];

      for (const eventType of eventTypes) {
        const webhookBody = {
          event: eventType,
          data: { id: "test_123" },
        };

        const rawBody = Buffer.from(JSON.stringify(webhookBody));
        const sign = createSign("RSA-SHA256");
        sign.update(rawBody);
        const signature = sign.sign(testPrivateKey, "base64");

        const response = await request(app.getHttpServer())
          .post("/webhooks/afriex")
          .set("x-webhook-signature", signature)
          .set("Content-Type", "application/json")
          .send(webhookBody);

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ status: "ok" });
      }

      expect(mockEventsService.publishWebhookEvent).toHaveBeenCalledTimes(
        eventTypes.length,
      );
      expect(mockQueuesService.addWebhookToQueue).toHaveBeenCalledTimes(
        eventTypes.length,
      );
    });

    it("should return 201 but avoid processing for duplicate transaction event", async () => {
      const webhookBody = {
        event: "TRANSACTION.UPDATED",
        data: {
          transactionId: "txn_dup_123",
          status: "COMPLETED",
        },
      };

      const rawBody = Buffer.from(JSON.stringify(webhookBody));
      const sign = createSign("RSA-SHA256");
      sign.update(rawBody);
      const signature = sign.sign(testPrivateKey, "base64");

      // Mock idempotency failure (duplicate)
      jest
        .spyOn(webhooksService, "checkIdempotency")
        .mockResolvedValueOnce(false);

      const response = await request(app.getHttpServer())
        .post("/webhooks/afriex")
        .set("x-webhook-signature", signature)
        .set("Content-Type", "application/json")
        .send(webhookBody);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        status: "ok",
        detail: "duplicate_ignored",
      });
      expect(mockEventsService.publishWebhookEvent).not.toHaveBeenCalled();
      expect(mockQueuesService.addWebhookToQueue).not.toHaveBeenCalled();
    });
  });
});
