export class CreateWithdrawalDto {
  amount!: number;
  asset!: "USDT" | "USDC";
  currency!: "NGN" | "USD" | "GBP" | "EUR" | "CAD";
  destinationPaymentMethodId?: string;
}
