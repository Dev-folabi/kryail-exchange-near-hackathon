import { Injectable } from "@nestjs/common";

@Injectable()
export class MockPaymentService {
  async getRates(pairs: string[], currencies: string[]) {
    return {
      rates: {
        USDT: {
          NGN: 1450,
          USD: 1,
          GBP: 0.79,
          EUR: 0.92,
          CAD: 1.36,
        },
        USDC: {
          NGN: 1450,
          USD: 1,
        },
      },
    };
  }

  async getVirtualAccount(currency: string) {
    return {
      paymentMethodId: `mock_pm_${Date.now()}`,
      institutionName: "Mock Bank",
      accountNumber: "1234567890",
      accountName: "Kryail Mock User",
      currency,
    };
  }

  async getCryptoWallet(asset: string) {
    return {
      paymentMethodId: `mock_pm_${Date.now()}`,
      address: "0xMockAddress123456789",
      network: "TRON",
      asset,
    };
  }

  async createTransaction(data: any) {
    return {
      transactionId: `mock_tx_${Date.now()}`,
      status: "pending",
      ...data,
    };
  }
}
