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
