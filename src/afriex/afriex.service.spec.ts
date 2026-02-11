import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { of, throwError } from "rxjs";
import { AxiosResponse, AxiosError } from "axios";
import { AfriexService } from "./afriex.service";
import { AfriexException } from "./afriex.exception";
import {
  CreateCustomerDto,
  CryptoAsset,
  PaymentChannel,
} from "./afriex.interface";

describe("AfriexService", () => {
  let service: AfriexService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        NODE_ENV: "development",
        AFRIX_BASE_URL: "https://staging.afx-server.com",
        AFRIX_API_KEY: "test-api-key",
      };
      return config[key];
    }),
  };

  const mockHttpService = {
    request: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AfriexService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AfriexService>(AfriexService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Development Mode (Mocking)", () => {
    it("should be defined", () => {
      expect(service).toBeDefined();
    });

    it("should return mock customer when creating customer in dev mode", async () => {
      const dto: CreateCustomerDto = {
        name: "John Doe",
        email: "john@example.com",
        phone: "+2348012345678",
        countryCode: "NG",
      };

      const result = await service.createCustomer(dto);

      expect(result).toBeDefined();
      expect(result.customerId).toContain("mock_cus_");
      expect(result.fullName).toBe(dto.name);
      expect(result.email).toBe(dto.email);
      expect(result.phone).toBe(dto.phone);
    });

    it("should return mock virtual account in dev mode", async () => {
      const result = await service.getVirtualAccount("NGN", "cus_123");

      expect(result).toBeDefined();
      expect(result.paymentMethodId).toContain("mock_va_");
      expect(result.institution).toBe("MockBank");
      expect(result.accountNumber).toMatch(/^01\d{8}$/);
      expect(result.currency).toBe("NGN");
    });

    it("should return mock crypto wallet in dev mode", async () => {
      const result = await service.getCryptoWallet(CryptoAsset.USDT, "cus_123");

      expect(result).toBeDefined();
      expect(result.paymentMethodId).toContain("mock_cw_");
      expect(result.address).toMatch(/^0x[a-f0-9]{40}$/);
      expect(result.asset).toBe(CryptoAsset.USDT);
    });

    it("should return mock transaction when creating transaction in dev mode", async () => {
      const dto = {
        customerId: "cus_123",
        destinationAmount: 50000,
        currency: "NGN",
        destinationId: "pm_123",
        sourceCurrency: "USD",
      };

      const result = await service.createTransaction(dto);

      expect(result).toBeDefined();
      expect(result.transactionId).toContain("mock_txn_");
      expect(result.destinationAmount).toBe(dto.destinationAmount);
      expect(result.status).toBeDefined();
    });

    it("should return mock institutions list in dev mode", async () => {
      const result = await service.getInstitutions(PaymentChannel.BANK, "NG");

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("code");
      expect(result[0]).toHaveProperty("name");
    });

    it("should return mock rates in dev mode", async () => {
      const result = await service.getRates("USD", ["NGN", "GBP"]);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty("base");
      expect(result[0]).toHaveProperty("symbol");
      expect(result[0]).toHaveProperty("rate");
    });
  });

  describe("Production Mode (Real API)", () => {
    beforeEach(() => {
      // Override config to simulate production
      mockConfigService.get.mockImplementation((key: string) => {
        const config = {
          NODE_ENV: "production",
          AFRIX_BASE_URL: "https://api.afx-server.com",
          AFRIX_API_KEY: "prod-api-key",
        };
        return config[key];
      });

      // Recreate service with production config
      service = new AfriexService(httpService as any, configService as any);
    });

    it("should make real API call to create customer in production", async () => {
      const dto: CreateCustomerDto = {
        name: "Jane Smith",
        email: "jane@example.com",
        phone: "+2348087654321",
        countryCode: "NG",
      };

      const mockResponse: AxiosResponse = {
        data: {
          customerId: "cus_real_123",
          fullName: dto.name,
          email: dto.email,
          phone: dto.phone,
          countryCode: dto.countryCode,
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      mockHttpService.request.mockReturnValue(of(mockResponse));

      const result = await service.createCustomer(dto);

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: expect.stringContaining("/api/v1/customer"),
          data: dto,
        }),
      );
      expect(result.customerId).toBe("cus_real_123");
    });

    it("should handle API errors and throw AfriexException", async () => {
      const dto: CreateCustomerDto = {
        name: "Error Test",
        email: "error@example.com",
        phone: "+2348012345678",
        countryCode: "NG",
      };

      const axiosError = {
        response: {
          status: 400,
          data: {
            message: "Invalid phone number",
            code: "INVALID_PHONE",
          },
        },
        isAxiosError: true,
      } as AxiosError;

      mockHttpService.request.mockReturnValue(throwError(() => axiosError));

      await expect(service.createCustomer(dto)).rejects.toThrow(
        AfriexException,
      );
    });

    it("should make real API call to get virtual account", async () => {
      const mockResponse: AxiosResponse = {
        data: {
          paymentMethodId: "pm_va_123",
          institution: "GTBank",
          accountNumber: "0123456789",
          accountName: "Kryail Exchange",
          currency: "NGN",
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      mockHttpService.request.mockReturnValue(of(mockResponse));

      const result = await service.getVirtualAccount("NGN", "cus_123");

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: expect.stringContaining(
            "/api/v1/payment-method/virtual-account",
          ),
        }),
      );
      expect(result.paymentMethodId).toBe("pm_va_123");
    });

    it("should make real API call to get crypto wallet", async () => {
      const mockResponse: AxiosResponse = {
        data: {
          paymentMethodId: "pm_cw_123",
          address: "0x1234567890abcdef1234567890abcdef12345678",
          network: "TRC20",
          asset: "USDT",
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      mockHttpService.request.mockReturnValue(of(mockResponse));

      const result = await service.getCryptoWallet(CryptoAsset.USDT);

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: expect.stringContaining("/api/v1/payment-method/crypto-wallet"),
        }),
      );
      expect(result.address).toBe("0x1234567890abcdef1234567890abcdef12345678");
    });
  });
});
