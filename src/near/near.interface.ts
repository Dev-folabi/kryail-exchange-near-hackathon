export interface NearConfig {
  networkId: string;
  nodeUrl: string;
  walletUrl: string;
  helperUrl: string;
  explorerUrl: string;
}

export interface ConnectState {
  phone: string;
  timestamp: number;
}

export interface ConnectCallbackDto {
  state: string;
  accountId: string;
  publicKey?: string;
  allKeys?: string[];
}

export interface AccountBalance {
  total: string;
  available: string;
  stateStaked: string;
  staked: string;
}

export type IntentType = "inbound_remittance" | "transfer";

export interface RecipientInfo {
  address: string; // NEAR account ID or 0x address
  type: "near_account" | "external_address";
}

export interface RemittanceIntent {
  type: IntentType;
  amount: number;
  source: "USD" | "GBP" | "EUR" | "CAD" | "NGN";
  target: "NGN" | "USDT" | "USDC";
  recipient: string; // NEAR account ID or 0x address
  timestamp: number;
  userId: number;
}

export interface AgentInfo {
  agentId: string;
  userNearId: string;
  createdAt: number;
}

export interface AgentExecutionResult {
  status: "completed" | "failed" | "pending";
  txHash?: string;
  error?: string;
  recipient?: string;
  amount?: number;
}
