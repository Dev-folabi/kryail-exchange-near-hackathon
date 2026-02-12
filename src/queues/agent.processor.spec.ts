import { Test, TestingModule } from "@nestjs/testing";
import { AgentProcessor } from "./agent.processor";
import { NearService } from "../near/near.service";
import { QueuesService } from "./queues.service";
import * as databaseModule from "../database/database.module";
import { Job } from "bull";

describe("AgentProcessor", () => {
  let processor: AgentProcessor;
  let nearService: NearService;
  let queuesService: QueuesService;
  let db: any;

  const mockNearService = {
    executeIntentWithAgent: jest.fn(),
    getCrossBorderQuote: jest.fn(),
  };

  const mockQueuesService = {
    addNotificationToQueue: jest.fn(),
  };

  const mockDb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentProcessor,
        { provide: NearService, useValue: mockNearService },
        { provide: QueuesService, useValue: mockQueuesService },
        { provide: databaseModule.DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    processor = module.get<AgentProcessor>(AgentProcessor);
    nearService = module.get<NearService>(NearService);
    queuesService = module.get<QueuesService>(QueuesService);
    db = module.get(databaseModule.DRIZZLE);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should handle inbound remittance execution with quote", async () => {
    const job = {
      data: {
        agentId: "agent-123",
        intent: {
          type: "inbound_remittance",
          amount: 100,
          source: "USD",
          target: "NGN",
        },
        userId: 1,
      },
    } as Job;

    const executionResult = {
      status: "completed",
      txHash: "tx_hash_123",
    };

    mockNearService.executeIntentWithAgent.mockResolvedValue(executionResult);
    mockNearService.getCrossBorderQuote.mockResolvedValue({
      rate: 1600,
      estimatedAmount: 160000,
    });
    mockDb.limit.mockResolvedValue([{ phone: "+1234567890" }]);

    await processor.handleAgentExecution(job);

    expect(nearService.executeIntentWithAgent).toHaveBeenCalledWith(
      "agent-123",
      job.data.intent,
    );
    expect(nearService.getCrossBorderQuote).toHaveBeenCalledWith(
      100,
      "USD",
      "NGN",
    );
    expect(queuesService.addNotificationToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("✅ *Inbound Remittance Complete!*"),
        phone: "+1234567890",
      }),
    );
  });

  it("should handle execution failure and throw error", async () => {
    const job = {
      data: {
        agentId: "agent-123",
        intent: {},
        userId: 1,
      },
      attemptsMade: 0,
      opts: { attempts: 5 },
    } as Job;

    mockNearService.executeIntentWithAgent.mockResolvedValue({
      status: "failed",
      error: "Execution failed",
    });

    await expect(processor.handleAgentExecution(job)).rejects.toThrow(
      "Execution failed",
    );
    expect(queuesService.addNotificationToQueue).not.toHaveBeenCalled();
  });

  it("should notify user on final failure attempt", async () => {
    const job = {
      data: {
        agentId: "agent-123",
        intent: {},
        userId: 1,
      },
      attemptsMade: 5,
      opts: { attempts: 5 },
    } as Job;

    mockNearService.executeIntentWithAgent.mockResolvedValue({
      status: "failed",
      error: "Execution failed",
    });
    mockDb.limit.mockResolvedValue([{ phone: "+1234567890" }]);

    await expect(processor.handleAgentExecution(job)).rejects.toThrow(
      "Execution failed",
    );

    expect(queuesService.addNotificationToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("❌ *Remittance Failed*"),
      }),
    );
  });
});
