import { ParsedIntent } from "../messaging.interface";

/**
 * Fallback regex-based intent parser
 * Used when LLM fails or returns invalid JSON
 */
export function fallbackParse(message: string): ParsedIntent {
  const msg = message.trim().toLowerCase();

  // Deposit pattern: "deposit 5000 NGN" or "deposit 5000"
  const depositMatch = msg.match(/deposit\s+(\d+(?:\.\d+)?)\s*(\w+)?/i);
  if (depositMatch) {
    return {
      intent: "deposit",
      amount: parseFloat(depositMatch[1]),
      currency: depositMatch[2]?.toUpperCase() || "NGN",
    };
  }

  // Withdraw pattern: "withdraw 5000 NGN" or "withdraw 5000"
  const withdrawMatch = msg.match(/withdraw\s+(\d+(?:\.\d+)?)\s*(\w+)?/i);
  if (withdrawMatch) {
    return {
      intent: "withdraw",
      amount: parseFloat(withdrawMatch[1]),
      currency: withdrawMatch[2]?.toUpperCase() || "NGN",
    };
  }

  // Send pattern: "send 1000 NGN to +234..." or "send 1000 to +234..."
  const sendMatch = msg.match(/send\s+(\d+(?:\.\d+)?)\s*(\w+)?\s+to\s+(.+)/i);
  if (sendMatch) {
    return {
      intent: "send",
      amount: parseFloat(sendMatch[1]),
      currency: sendMatch[2]?.toUpperCase() || "NGN",
      target: sendMatch[3].trim(),
    };
  }

  // Balance pattern: "balance" or "check balance"
  if (msg.match(/balance/i)) {
    return { intent: "balance" };
  }

  // Set PIN pattern: "set pin" or "change pin"
  if (msg.match(/set\s+pin|change\s+pin/i)) {
    return { intent: "set_pin" };
  }

  // Help pattern: "help" or "what can you do"
  if (msg.match(/help|what can you do/i)) {
    return { intent: "help" };
  }

  // Onboarding pattern: "register" or "sign up" or "start"
  if (msg.match(/register|sign\s*up|start|onboard/i)) {
    return { intent: "onboard" };
  }

  // Rate pattern: "rate", "price", "exchange"
  // e.g., "rate NGN", "price of USDT", "exchange rate"
  const rateMatch = msg.match(/rate|price|exchange/i);
  if (rateMatch) {
    // Try to extract currency
    const currencyMatch = msg.match(/(USDT|USDC|NGN|USD|GBP|EUR|CAD)/i);
    return {
      intent: "rate",
      currency: currencyMatch ? currencyMatch[1].toUpperCase() : undefined,
    };
  }

  // Default: unknown
  return { intent: "unknown" };
}
