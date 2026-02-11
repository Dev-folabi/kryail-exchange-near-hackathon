import {
  IsString,
  IsEmail,
  IsOptional,
  IsObject,
  IsNumber,
  IsEnum,
  IsNotEmpty,
} from "class-validator";

export interface Customer {
  customerId: string;
  fullName: string;
  email?: string;
  phone: string;
  countryCode: string;
  kyc?: Record<string, any>;
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  countryCode!: string;

  @IsObject()
  @IsOptional()
  kyc?: Record<string, any>;

  @IsObject()
  @IsOptional()
  meta?: Record<string, any>;
}

export class UpdateKycDto {
  @IsObject()
  @IsNotEmpty()
  kyc!: Record<string, any>;
}

export enum PaymentChannel {
  BANK = "bank",
  MOBILE_MONEY = "mobile_money",
}

export enum CryptoAsset {
  USDT = "USDT",
  USDC = "USDC",
}

export interface PaymentMethod {
  paymentMethodId: string;
  customerId: string;
  type: "bank" | "mobile_money" | "virtual_account" | "crypto_wallet";
  accountName?: string;
  accountNumber?: string;
  institution?: string;
  institutionCode?: string;
  channel?: PaymentChannel;
  address?: string;
  network?: string;
  asset?: CryptoAsset;
  createdAt?: string;
}

export interface InstitutionDetails {
  institutionId: string;
  institutionName: string;
  institutionCode: string;
  institutionAddress: string;
}

export interface TransactionDetails {
  transactionInvoice: string;
  transactionNarration: string;
}

export class CreatePaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsObject()
  @IsNotEmpty()
  institution!: InstitutionDetails;

  @IsObject()
  @IsOptional()
  transaction?: TransactionDetails;

  @IsEnum(PaymentChannel)
  @IsNotEmpty()
  channel!: PaymentChannel;

  @IsString()
  @IsNotEmpty()
  countryCode!: string;

  @IsString()
  @IsNotEmpty()
  accountName!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsObject()
  @IsOptional()
  meta?: Record<string, any>;
}

export interface VirtualAccount {
  paymentMethodId: string;
  institution: string;
  institutionName: string;
  accountNumber: string;
  accountName: string;
  currency: string;
  customerId?: string;
}

export interface CryptoWallet {
  paymentMethodId: string;
  address: string;
  network: string;
  asset: CryptoAsset;
  customerId?: string;
}

export interface Institution {
  code: string;
  name: string;
  channel: PaymentChannel;
  countryCode: string;
}

export interface ResolvedAccount {
  accountNumber: string;
  accountName: string;
  institutionCode: string;
  institution: string;
}

export enum TransactionStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum TransactionType {
  DEPOSIT = "deposit",
  WITHDRAWAL = "withdrawal",
  PAYOUT = "payout",
}

export interface Transaction {
  transactionId: string;
  customerId: string;
  type: TransactionType;
  status: TransactionStatus;
  sourceAmount?: number;
  sourceCurrency?: string;
  destinationAmount: number;
  destinationCurrency: string;
  destinationId?: string;
  rate?: number;
  fee?: number;
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export class CreateTransactionDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsNumber()
  @IsNotEmpty()
  destinationAmount!: number;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsString()
  @IsNotEmpty()
  destinationId!: string;

  @IsString()
  @IsOptional()
  sourceCurrency?: string;

  @IsObject()
  @IsOptional()
  meta?: Record<string, any>;
}

export interface Balance {
  currency: string;
  available: number;
  pending: number;
}

export interface Rate {
  base: string;
  symbol: string;
  rate: number;
  timestamp?: string;
}

export interface ExchangeRateResponse {
  rates: Record<string, Record<string, string>>;
  base: string[];
  updatedAt: number;
}

export type WebhookEventType =
  | "CUSTOMER.CREATED"
  | "CUSTOMER.UPDATED"
  | "CUSTOMER.DELETED"
  | "PAYMENT_METHOD.CREATED"
  | "PAYMENT_METHOD.UPDATED"
  | "PAYMENT_METHOD.DELETED"
  | "TRANSACTION.CREATED"
  | "TRANSACTION.UPDATED";

export interface WebhookEvent {
  event: WebhookEventType;
  data: Record<string, any>;
  timestamp?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface AfriexApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}
