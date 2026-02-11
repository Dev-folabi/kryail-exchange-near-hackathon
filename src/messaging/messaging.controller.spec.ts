import { Test, TestingModule } from "@nestjs/testing";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { TwilioService } from "./twilio.service";
import { ThrottlerGuard } from "@nestjs/throttler";

const mockMessagingService = {
  handleIncoming: jest.fn(),
};

const mockTwilioService = {
  validateRequest: jest.fn(),
  sendMessage: jest.fn(),
};

describe("MessagingController", () => {
  let controller: MessagingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagingController],
      providers: [
        { provide: MessagingService, useValue: mockMessagingService },
        { provide: TwilioService, useValue: mockTwilioService },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true }) // Bypass throttler for tests
      .compile();

    controller = module.get<MessagingController>(MessagingController);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("handleTwilioWebhook", () => {
    const mockRequest = {
      headers: { "x-twilio-signature": "mock-sig" },
      protocol: "http",
      get: jest.fn().mockReturnValue("localhost"),
      originalUrl: "/messaging/twilio",
      body: {
        From: "whatsapp:+1234567890",
        Body: "Hello",
        MessageSid: "SM123",
      },
    } as any;

    const mockBody = {
      From: "whatsapp:+1234567890",
      Body: "Hello",
      MessageSid: "SM123",
    };

    it("should process valid request and send reply", async () => {
      mockTwilioService.validateRequest.mockReturnValue(true);
      mockMessagingService.handleIncoming.mockResolvedValue("Reply message");

      const result = await controller.handleTwilioWebhook(
        mockRequest,
        mockBody,
      );

      expect(result).toEqual({ success: true });
      expect(mockTwilioService.validateRequest).toHaveBeenCalled();
      expect(mockMessagingService.handleIncoming).toHaveBeenCalledWith(
        "whatsapp:+1234567890",
        "Hello",
      );
      expect(mockTwilioService.sendMessage).toHaveBeenCalledWith(
        "whatsapp:+1234567890",
        "Reply message",
      );
    });

    it("should return success:false for invalid signature (to stop retries)", async () => {
      mockTwilioService.validateRequest.mockReturnValue(false);

      const result = await controller.handleTwilioWebhook(
        mockRequest,
        mockBody,
      );

      // Implementation catches UnauthorizedException and returns success:false
      expect(result).toEqual({ success: false });
      expect(mockTwilioService.sendMessage).not.toHaveBeenCalled();
    });

    it("should handle messaging service errors gracefully", async () => {
      mockTwilioService.validateRequest.mockReturnValue(true);
      mockMessagingService.handleIncoming.mockRejectedValue(
        new Error("Processing failed"),
      );

      const result = await controller.handleTwilioWebhook(
        mockRequest,
        mockBody,
      );

      // Should still return success:false or similar to stop retries,
      // depending on implementation. In our case, catch block returns success:false
      expect(result).toEqual({ success: false });
    });
  });
});
