import {
  // Customer,
  // CreateCustomerDto,
  VirtualAccount,
  CryptoWallet,
  CryptoAsset,
  // Transaction,
  // CreateTransactionDto,
  // TransactionStatus,
  // TransactionType,
  // PaymentMethod,
  // CreatePaymentMethodDto,
  // Institution,
  // PaymentChannel,
  // ResolvedAccount,
  // Balance,
  // Rate,
  // PaginatedResponse,
} from "./afriex.interface";

/**
 * Generate a random mock ID
 */
function generateMockId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Mock customer creation
 */
// export function mockCreateCustomer(dto: CreateCustomerDto): Customer {
//   return {
//     customerId: generateMockId("mock_cus"),
//     fullName: dto.name,
//     email: dto.email,
//     phone: dto.phone,
//     countryCode: dto.countryCode,
//     kyc: dto.kyc || {},
//     meta: dto.meta || {},
//     createdAt: new Date().toISOString(),
//     updatedAt: new Date().toISOString(),
//   };
// }

/**
 * Mock customer list
 */
// export function mockGetCustomerList(
//   page: number,
//   limit: number,
// ): PaginatedResponse<Customer> {
//   const mockCustomers: Customer[] = [
//     {
//       customerId: generateMockId("mock_cus"),
//       fullName: "John Doe",
//       email: "john@example.com",
//       phone: "+2348012345678",
//       countryCode: "NG",
//       createdAt: new Date().toISOString(),
//       updatedAt: new Date().toISOString(),
//     },
//     {
//       customerId: generateMockId("mock_cus"),
//       fullName: "Jane Smith",
//       email: "jane@example.com",
//       phone: "+2348087654321",
//       countryCode: "NG",
//       createdAt: new Date().toISOString(),
//       updatedAt: new Date().toISOString(),
//     },
//   ];

//   return {
//     data: mockCustomers.slice(0, limit),
//     page,
//     limit,
//     total: mockCustomers.length,
//     hasMore: page * limit < mockCustomers.length,
//   };
// }

/**
 * Mock get single customer
 */
// export function mockGetCustomer(id: string): Customer {
//   return {
//     customerId: id,
//     fullName: "Mock Customer",
//     email: "mock@example.com",
//     phone: "+2348012345678",
//     countryCode: "NG",
//     kyc: { BVN: "12345678901" },
//     meta: {},
//     createdAt: new Date().toISOString(),
//     updatedAt: new Date().toISOString(),
//   };
// }

/**
 * Mock KYC update
 */
// export function mockUpdateKyc(id: string, kyc: Record<string, any>): Customer {
//   return {
//     customerId: id,
//     fullName: "Mock Customer",
//     email: "mock@example.com",
//     phone: "+2348012345678",
//     countryCode: "NG",
//     kyc,
//     meta: {},
//     createdAt: new Date().toISOString(),
//     updatedAt: new Date().toISOString(),
//   };
// }

/**
 * Mock virtual account creation
 */
export function mockGetVirtualAccount(
  currency: string,
  customerId?: string,
): VirtualAccount {
  return {
    paymentMethodId: generateMockId("mock_va"),
    institution: "058",
    institutionName: "GTBank",
    accountNumber: `01${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, "0")}`,
    accountName: "Kryail Exchange",
    currency,
    customerId,
  };
}

/**
 * Mock crypto wallet creation
 */
export function mockGetCryptoWallet(
  asset: CryptoAsset,
  customerId?: string,
): CryptoWallet {
  const mockAddress = `0x${Math.random().toString(16).substring(2, 42).padEnd(40, "0")}`;

  return {
    paymentMethodId: generateMockId("mock_cw"),
    address: mockAddress,
    network: asset === CryptoAsset.USDT ? "TRC20" : "ERC20",
    asset,
    customerId,
  };
}

/**
 * Mock payment method creation
 */
// export function mockCreatePaymentMethod(
//   dto: CreatePaymentMethodDto,
// ): PaymentMethod {
//   return {
//     paymentMethodId: generateMockId("mock_pm"),
//     customerId: dto.customerId,
//     type: "bank",
//     accountName: dto.accountName,
//     accountNumber: dto.accountNumber,
//     institution: dto.institution,
//     institutionCode: dto.institutionCode,
//     channel: dto.channel,
//     createdAt: new Date().toISOString(),
//   };
// }

/**
 * Mock institutions list
 */
// export function mockGetInstitutions(
//   channel: PaymentChannel,
//   countryCode: string,
// ): Institution[] {
//   return [
//     {
//       code: "058",
//       name: "GTBank",
//       channel,
//       countryCode,
//     },
//     {
//       code: "044",
//       name: "Access Bank",
//       channel,
//       countryCode,
//     },
//     {
//       code: "033",
//       name: "United Bank for Africa",
//       channel,
//       countryCode,
//     },
//     {
//       code: "011",
//       name: "First Bank of Nigeria",
//       channel,
//       countryCode,
//     },
//   ];
// }

/**
 * Mock account resolution
 */
// export function mockResolveAccount(
//   channel: PaymentChannel,
//   accountNumber: string,
//   institutionCode?: string,
// ): ResolvedAccount {
//   return {
//     accountNumber,
//     accountName: "Mock Account Holder",
//     institutionCode: institutionCode || "058",
//     institution: "GTBank",
//   };
// }

/**
 * Mock transaction creation
 */
// export function mockCreateTransaction(dto: CreateTransactionDto): Transaction {
//   return {
//     transactionId: generateMockId("mock_txn"),
//     customerId: dto.customerId,
//     type: TransactionType.PAYOUT,
//     status: TransactionStatus.PENDING,
//     destinationAmount: dto.destinationAmount,
//     destinationCurrency: dto.currency,
//     destinationId: dto.destinationId,
//     sourceCurrency: dto.sourceCurrency || "USD",
//     sourceAmount: dto.destinationAmount * 0.0013, // Mock rate
//     rate: 750, // Mock NGN/USD rate
//     fee: dto.destinationAmount * 0.01, // 1% fee
//     meta: dto.meta || {},
//     createdAt: new Date().toISOString(),
//     updatedAt: new Date().toISOString(),
//   };
// }

/**
 * Mock transaction list
 */
// export function mockGetTransactionList(
//   page: number,
//   limit: number,
// ): PaginatedResponse<Transaction> {
//   const mockTransactions: Transaction[] = [
//     {
//       transactionId: generateMockId("mock_txn"),
//       customerId: generateMockId("mock_cus"),
//       type: TransactionType.PAYOUT,
//       status: TransactionStatus.COMPLETED,
//       destinationAmount: 50000,
//       destinationCurrency: "NGN",
//       sourceCurrency: "USD",
//       sourceAmount: 66.67,
//       rate: 750,
//       fee: 500,
//       createdAt: new Date().toISOString(),
//       updatedAt: new Date().toISOString(),
//     },
//   ];

//   return {
//     data: mockTransactions.slice(0, limit),
//     page,
//     limit,
//     total: mockTransactions.length,
//     hasMore: page * limit < mockTransactions.length,
//   };
// }

/**
 * Mock get single transaction
 */
// export function mockGetTransaction(id: string): Transaction {
//   return {
//     transactionId: id,
//     customerId: generateMockId("mock_cus"),
//     type: TransactionType.PAYOUT,
//     status: TransactionStatus.COMPLETED,
//     destinationAmount: 50000,
//     destinationCurrency: "NGN",
//     sourceCurrency: "USD",
//     sourceAmount: 66.67,
//     rate: 750,
//     fee: 500,
//     createdAt: new Date().toISOString(),
//     updatedAt: new Date().toISOString(),
//   };
// }

/**
 * Mock balance
 */
// export function mockGetBalance(currencies: string[]): Balance[] {
//   return currencies.map((currency) => ({
//     currency,
//     available: Math.random() * 100000,
//     pending: Math.random() * 10000,
//   }));
// }

/**
 * Mock rates
 */
// export function mockGetRates(base: string, symbols: string[]): Rate[] {
//   const mockRates: Record<string, number> = {
//     NGN: 750,
//     USD: 1,
//     GBP: 0.79,
//     EUR: 0.92,
//     CAD: 1.35,
//   };

//   return symbols.map((symbol) => ({
//     base,
//     symbol,
//     rate: mockRates[symbol] || 1,
//     timestamp: new Date().toISOString(),
//   }));
// }
