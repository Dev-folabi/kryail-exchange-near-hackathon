export interface ParsedIntent {
  intent:
    | "deposit"
    | "withdraw"
    | "balance"
    | "send"
    | "receive_inbound"
    | "help"
    | "onboard"
    | "set_pin"
    | "rate"
    | "unknown";
  amount?: number;
  currency?: string;
  sourceCurrency?: "USD" | "GBP" | "EUR" | "CAD" | "NGN" | null;
  targetCurrency?: "NGN" | "USDT" | "USDC" | null;
  target?: string; // Phone number or 0x... address
  step?: "name" | "pin" | "confirm_pin" | "kyc" | null;
  extractedDetails?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    dob?: string;
    country?: string;
  };
}

export interface TwilioIncoming {
  From: string;
  Body: string;
  MessageSid: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

export interface SessionData {
  jwt?: string;
  onboardingStep?:
    | "name"
    | "email"
    | "pin"
    | "confirm_pin"
    | "near_connect"
    | "kyc_document"
    | "kyc"
    | "complete";
  lastIntent?: string;
  tempData?: Record<string, any>;
  isPinVerified?: boolean;
  pendingAction?: "withdraw" | "send" | "pin_change";
  pendingData?: any;
  pinChangeStep?: "current" | "new" | "confirm";
}
