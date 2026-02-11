import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { of, throwError } from "rxjs";
import { LlmService } from "./llm.service";

// Mock dependencies
const mockHttpService = {
  post: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === "openrouter.apiKey") return "mock-api-key";
    if (key === "openrouter.model") return "mock-model";
    return null;
  }),
};

describe("LlmService", () => {
  let service: LlmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("parseIntent", () => {
    it("should successfully parse valid JSON response", async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: "deposit",
                  amount: 5000,
                  currency: "NGN",
                }),
              },
            },
          ],
        },
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.parseIntent("deposit 5000 NGN");

      expect(result).toEqual({
        intent: "deposit",
        amount: 5000,
        currency: "NGN",
      });
      expect(mockHttpService.post).toHaveBeenCalled();
    });

    it("should return null when LLM returns invalid JSON", async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "I think you want to deposit money.", // Not JSON
              },
            },
          ],
        },
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.parseIntent("deposit money");

      expect(result).toBeNull();
    });

    it("should return null when HTTP request fails", async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error("API Error")),
      );

      const result = await service.parseIntent("deposit 5000");

      expect(result).toBeNull();
    });

    it("should return null when response structure is invalid", async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({ foo: "bar" }), // Missing intent field
              },
            },
          ],
        },
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.parseIntent("test");

      expect(result).toBeNull();
    });

    it("should include session context in prompt", async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({ intent: "onboard", step: "pin" }),
              },
            },
          ],
        },
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      await service.parseIntent("my name is John", {
        onboardingStep: "name",
      });

      // Verify the prompt contains context
      const calls = mockHttpService.post.mock.calls[0];
      const body = calls[1];
      expect(body.messages[0].content).toContain(
        'Context: User is in onboarding step "name"',
      );
    });
  });
});
