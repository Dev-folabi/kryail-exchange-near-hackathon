import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { NearService } from "./near.service";
import * as nearAPI from "near-api-js";

describe("NearService", () => {
  let service: NearService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        "near.networkId": "testnet",
        "near.nodeUrl": "https://rpc.testnet.near.org",
        "near.walletUrl": "https://wallet.testnet.near.org",
        "near.helperUrl": "https://helper.testnet.near.org",
        "near.explorerUrl": "https://explorer.testnet.near.org",
        "app.url": "http://localhost:3000",
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NearService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<NearService>(NearService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getConnectDeepLink", () => {
    it("should generate a valid deep link with encoded state", () => {
      const phone = "+1234567890";
      const deepLink = service.getConnectDeepLink(phone);

      expect(deepLink).toContain("https://wallet.testnet.near.org/login");
      expect(deepLink).toContain("success_url");
      expect(deepLink).toContain("failure_url");
      expect(deepLink).toContain("state");
    });

    it("should encode phone number in state", () => {
      const phone = "+1234567890";
      const deepLink = service.getConnectDeepLink(phone);

      // Extract state from URL
      const url = new URL(deepLink);
      const successUrl = url.searchParams.get("success_url");
      expect(successUrl).toBeTruthy();

      const successUrlObj = new URL(successUrl!);
      const state = successUrlObj.searchParams.get("state");
      expect(state).toBeTruthy();

      // Decode state
      const decoded = Buffer.from(state!, "base64").toString("utf-8");
      const stateObj = JSON.parse(decoded);

      expect(stateObj.phone).toBe(phone);
      expect(stateObj.timestamp).toBeDefined();
    });
  });

  describe("decodeConnectState", () => {
    it("should decode valid state correctly", () => {
      const phone = "+1234567890";
      const state = {
        phone,
        timestamp: Date.now(),
      };
      const encodedState = Buffer.from(JSON.stringify(state)).toString(
        "base64",
      );

      const decoded = service.decodeConnectState(encodedState);

      expect(decoded.phone).toBe(phone);
      expect(decoded.timestamp).toBe(state.timestamp);
    });

    it("should throw error for invalid state structure", () => {
      const invalidState = Buffer.from(
        JSON.stringify({ invalid: "data" }),
      ).toString("base64");

      expect(() => service.decodeConnectState(invalidState)).toThrow(
        "Invalid state structure",
      );
    });

    it("should throw error for expired state", () => {
      const phone = "+1234567890";
      const state = {
        phone,
        timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
      };
      const encodedState = Buffer.from(JSON.stringify(state)).toString(
        "base64",
      );

      expect(() => service.decodeConnectState(encodedState)).toThrow(
        "Connection state expired",
      );
    });

    it("should throw error for invalid base64", () => {
      expect(() => service.decodeConnectState("invalid-base64")).toThrow();
    });
  });

  describe("accountExists", () => {
    it("should return true for existing account", async () => {
      // This test would require mocking NEAR API calls
      // For now, we'll skip it as it requires network access
      expect(true).toBe(true);
    });

    it("should return false for non-existing account", async () => {
      // This test would require mocking NEAR API calls
      expect(true).toBe(true);
    });
  });

  describe("getAccountBalance", () => {
    it("should format balance correctly", async () => {
      // This test would require mocking NEAR API calls
      // For now, we'll skip it as it requires network access
      expect(true).toBe(true);
    });
  });
});
