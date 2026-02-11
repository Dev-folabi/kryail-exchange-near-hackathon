import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { AxiosError } from "axios";
import * as Sentry from "@sentry/node";
import {
  Customer,
  CreateCustomerDto,
  UpdateKycDto,
  VirtualAccount,
  CryptoWallet,
  CryptoAsset,
  Transaction,
  CreateTransactionDto,
  PaymentMethod,
  CreatePaymentMethodDto,
  Institution,
  PaymentChannel,
  ResolvedAccount,
  Balance,
  ExchangeRateResponse,
  PaginatedResponse,
} from "./afriex.interface";
import { mockGetVirtualAccount, mockGetCryptoWallet } from "./afriex.mock";
import { AfriexException } from "./afriex.exception";

@Injectable()
export class AfriexService {
  private readonly logger = new Logger(AfriexService.name);
  private readonly isDev: boolean;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.isDev = this.configService.get<string>("NODE_ENV") !== "production";
    this.baseUrl =
      this.configService.get<string>("AFRIX_BASE_URL") ||
      "https://staging.afx-server.com";
    this.apiKey = this.configService.get<string>("AFRIX_API_KEY") || "";

    this.logger.log(
      `AfriexService initialized in ${this.isDev ? "DEVELOPMENT" : "PRODUCTION"} mode`,
    );
  }

  private useMock(): boolean {
    const isPlaceholder = this.apiKey === "your_staging_key" || !this.apiKey;
    const shouldMock = this.isDev && isPlaceholder;
    if (shouldMock) {
      this.logger.debug(
        `Using mock because isDev=${this.isDev}, isPlaceholder=${isPlaceholder}`,
      );
    } else if (this.isDev) {
      this.logger.debug(
        `NOT using mock because isPlaceholder=${isPlaceholder}, key length=${this.apiKey?.length}`,
      );
    }
    return shouldMock;
  }

  /**
   * Handle Axios errors and convert to AfriexException
   */
  private handleError(error: any, context: string): never {
    this.logger.error(`Afriex API Error in ${context}:`, error);

    // Log to Sentry
    Sentry.captureException(error, {
      tags: {
        service: "afriex",
        context,
      },
    });

    if (error instanceof AxiosError) {
      const status = error.response?.status || 500;
      const message =
        error.response?.data?.message || error.message || "Unknown error";
      const code = error.response?.data?.code || "AFRIEX_ERROR";

      throw new AfriexException(message, code, status, error.response?.data);
    }

    throw new AfriexException(
      error.message || "Internal server error",
      "INTERNAL_ERROR",
      500,
    );
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    endpoint: string,
    data?: any,
    params?: any,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.request<T>({
          method,
          url: `${this.baseUrl}${endpoint}`,
          data,
          params,
          headers: {
            "x-api-key": this.apiKey,
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.handleError(error, `${method} ${endpoint}`);
    }
  }

  async createCustomer(dto: CreateCustomerDto): Promise<Customer> {
    if (this.useMock()) {
      this.logger.debug("Using mock createCustomer");
      return {
        customerId: "mock-customer-id-" + Date.now(),
        ...dto,
        kycStatus: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as Customer;
    }
    return this.request<Customer>("POST", "/api/v1/customer", dto);
  }

  async getCustomerList(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<Customer>> {
    return this.request<PaginatedResponse<Customer>>(
      "GET",
      "/api/v1/customer",
      undefined,
      { page, limit },
    );
  }

  async getCustomer(id: string): Promise<Customer> {
    return this.request<Customer>("GET", `/api/v1/customer/${id}`);
  }

  async updateKyc(id: string, kycDto: UpdateKycDto): Promise<Customer> {
    return this.request<Customer>(
      "PATCH",
      `/api/v1/customer/${id}/kyc`,
      kycDto,
    );
  }

  async deleteCustomer(id: string): Promise<void> {
    await this.request<void>("DELETE", `/api/v1/customer/${id}`);
  }

  async createPaymentMethod(
    dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    return this.request<PaymentMethod>("POST", "/api/v1/payment-method", dto);
  }

  async getVirtualAccount(
    currency: string,
    customerId?: string,
  ): Promise<VirtualAccount> {
    if (this.useMock()) {
      this.logger.debug(
        `Using mock getVirtualAccount for currency: ${currency}`,
      );
      return mockGetVirtualAccount(currency, customerId);
    }

    return this.request<VirtualAccount>(
      "GET",
      "/api/v1/payment-method/virtual-account",
      undefined,
      { currency, customerId },
    );
  }

  async getCryptoWallet(
    asset: CryptoAsset,
    customerId?: string,
  ): Promise<CryptoWallet> {
    if (this.useMock()) {
      this.logger.debug(`Using mock getCryptoWallet for asset: ${asset}`);
      return mockGetCryptoWallet(asset, customerId);
    }

    return this.request<CryptoWallet>(
      "GET",
      "/api/v1/payment-method/crypto-wallet",
      undefined,
      { asset, customerId },
    );
  }

  async getInstitutions(
    channel: PaymentChannel,
    countryCode: string,
  ): Promise<Institution[]> {
    return this.request<Institution[]>(
      "GET",
      "/api/v1/payment-method/institution",
      undefined,
      { channel, countryCode },
    );
  }

  async resolveAccount(
    channel: PaymentChannel,
    accountNumber: string,
    institutionCode: string,
    countryCode: string,
  ): Promise<ResolvedAccount> {
    return this.request<ResolvedAccount>(
      "GET",
      "/api/v1/payment-method/resolve",
      undefined,
      { channel, accountNumber, institutionCode, countryCode },
    );
  }

  async createTransaction(dto: CreateTransactionDto): Promise<Transaction> {
    return this.request<Transaction>("POST", "/api/v1/transaction", dto);
  }

  async getTransactionList(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<Transaction>> {
    return this.request<PaginatedResponse<Transaction>>(
      "GET",
      "/api/v1/transaction",
      undefined,
      { page, limit },
    );
  }

  async getTransaction(id: string): Promise<Transaction> {
    return this.request<Transaction>("GET", `/api/v1/transaction/${id}`);
  }

  async getBalance(currencies: string[]): Promise<Balance[]> {
    return this.request<Balance[]>("GET", "/api/v1/org/balance", undefined, {
      currencies: currencies.join(","),
    });
  }

  async getRates(
    base: string[] = ["USDT", "USDC"],
    symbols: string[] = ["NGN", "USD", "GBP", "CAD", "EUR"],
  ): Promise<ExchangeRateResponse> {
    return this.request<ExchangeRateResponse>(
      "GET",
      "/v2/public/rates",
      undefined,
      {
        base: base.join(","),
        symbols: symbols.join(","),
      },
    );
  }
}
