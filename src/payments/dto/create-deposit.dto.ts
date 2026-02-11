export class CreateDepositDto {
  amount!: number;
  currency!: "NGN" | "USD" | "GBP" | "EUR" | "CAD" | "USDT" | "USDC";
}
