export interface ParsedIntent {
  sourceCurrency?: string;
  intent:
    | "deposit"
    | "withdraw"
    | "balance"
    | "send"
    | "help"
    | "onboard"
    | "set_pin"
    | "rate"
    | "unknown";
  amount?: number;
  currency?: string;
  target?: string;
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
