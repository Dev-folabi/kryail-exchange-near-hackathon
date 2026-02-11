import { Test, TestingModule } from "@nestjs/testing";
import { WebhookProcessor } from "./webhook.processor";
import { PaymentsService } from "../payments/payments.service";
import { UsersService } from "../users/users.service";
import { Job } from "bull";

describe("WebhookProcessor", () => {
  let processor: WebhookProcessor;
  let paymentsService: PaymentsService;
  let usersService: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        {
          provide: PaymentsService,
          useValue: {
            handleTransactionUpdate: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findByPhone: jest.fn(),
            updateAfriexId: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get<WebhookProcessor>(WebhookProcessor);
    paymentsService = module.get<PaymentsService>(PaymentsService);
    usersService = module.get<UsersService>(UsersService);
  });

  it("should be defined", () => {
    expect(processor).toBeDefined();
  });

  describe("handleWebhook", () => {
    it("should handle customer.created event", async () => {
      const job = {
        id: "1",
        data: {
          event: "customer.created",
          data: {
            id: "cust_123",
            phone: "+1234567890",
          },
        },
      } as Job;

      const mockUser = { id: 1, phone: "+1234567890" };
      (usersService.findByPhone as jest.Mock).mockResolvedValue(mockUser);

      await processor.handleWebhook(job);

      expect(usersService.findByPhone).toHaveBeenCalledWith("+1234567890");
      expect(usersService.updateAfriexId).toHaveBeenCalledWith(1, "cust_123");
    });

    it("should handle customer.updated event", async () => {
      const job = {
        id: "2",
        data: {
          event: "customer.updated",
          data: {
            id: "cust_123",
            phone: "+1234567890",
          },
        },
      } as Job;

      const mockUser = { id: 1, phone: "+1234567890" };
      (usersService.findByPhone as jest.Mock).mockResolvedValue(mockUser);

      await processor.handleWebhook(job);

      expect(usersService.updateAfriexId).toHaveBeenCalledWith(1, "cust_123");
    });

    it("should handle TRANSACTION.UPDATED event", async () => {
      const job = {
        id: "3",
        data: {
          event: "TRANSACTION.UPDATED",
          data: {
            id: "tx_123",
            status: "successful",
          },
        },
      } as unknown as Job;

      await processor.handleWebhook(job);

      expect(paymentsService.handleTransactionUpdate).toHaveBeenCalledWith(
        job.data,
      );
    });
  });
});
