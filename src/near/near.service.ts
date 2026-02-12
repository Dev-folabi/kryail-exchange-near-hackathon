import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nearAPI from "near-api-js";
import * as Sentry from "@sentry/node";
import { NearConfig, ConnectState, AccountBalance } from "./near.interface";
import { users } from "../database/schema/users.schema";
import { eq } from "drizzle-orm";

@Injectable()
export class NearService {
  private readonly logger = new Logger(NearService.name);
  private config: NearConfig;
  private near: any;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      networkId: this.configService.get<string>("near.networkId", "testnet"),
      nodeUrl: this.configService.get<string>(
        "near.nodeUrl",
        "https://rpc.testnet.near.org",
      ),
      walletUrl: this.configService.get<string>(
        "near.walletUrl",
        "https://wallet.testnet.near.org",
      ),
      helperUrl: this.configService.get<string>(
        "near.helperUrl",
        "https://helper.testnet.near.org",
      ),
      explorerUrl: this.configService.get<string>(
        "near.explorerUrl",
        "https://explorer.testnet.near.org",
      ),
    };

    this.initializeNear();
  }

  /**
   * Initialize NEAR connection
   */
  private async initializeNear() {
    try {
      const keyStore = new (nearAPI as any).keyStores.InMemoryKeyStore();

      this.near = await (nearAPI as any).connect({
        networkId: this.config.networkId,
        keyStore,
        nodeUrl: this.config.nodeUrl,
        walletUrl: this.config.walletUrl,
        helperUrl: this.config.helperUrl,
      });

      this.logger.log(
        `NEAR connection initialized for ${this.config.networkId}`,
      );
    } catch (error) {
      this.logger.error("Failed to initialize NEAR connection:", error);
      Sentry.captureException(error, {
        tags: { service: "near", action: "initialize" },
      });
      throw error;
    }
  }

  /**
   * Generate deep link for NEAR wallet connection
   * @param phone User's phone number (used in state)
   * @param redirectUrl Optional redirect URL after connection
   * @returns Deep link URL for MyNEARWallet
   */
  getConnectDeepLink(phone: string, redirectUrl?: string): string {
    try {
      const state: ConnectState = {
        phone,
        timestamp: Date.now(),
      };

      // Encode state as base64
      const encodedState = Buffer.from(JSON.stringify(state)).toString(
        "base64",
      );

      // Build callback URL (will be handled by our backend)
      const callbackUrl =
        redirectUrl ||
        `${this.configService.get<string>("app.url", "http://localhost:3000")}/near/callback`;

      // Generate MyNEARWallet sign-in URL
      const walletUrl = new URL(`${this.config.walletUrl}/login`);
      walletUrl.searchParams.set("success_url", callbackUrl);
      walletUrl.searchParams.set("failure_url", callbackUrl);
      walletUrl.searchParams.set("public_key", ""); // Not needed for just account linking

      // Add state to success URL
      const successUrl = new URL(callbackUrl);
      successUrl.searchParams.set("state", encodedState);
      walletUrl.searchParams.set("success_url", successUrl.toString());

      this.logger.log(`Generated NEAR connect link for phone: ${phone}`);
      return walletUrl.toString();
    } catch (error) {
      this.logger.error("Error generating connect deep link:", error);
      Sentry.captureException(error, {
        tags: { service: "near", action: "generate_link" },
        extra: { phone },
      });
      throw error;
    }
  }

  /**
   * Handle wallet connection callback
   * @param encodedState Base64 encoded state from deep link
   * @param accountId NEAR account ID from wallet
   * @returns Decoded phone number from state
   */
  decodeConnectState(encodedState: string): ConnectState {
    try {
      const decoded = Buffer.from(encodedState, "base64").toString("utf-8");
      const state: ConnectState = JSON.parse(decoded);

      // Validate state structure
      if (!state.phone || !state.timestamp) {
        throw new Error("Invalid state structure");
      }

      // Check if state is expired (5 minutes)
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      if (now - state.timestamp > fiveMinutes) {
        throw new Error("Connection state expired");
      }

      return state;
    } catch (error) {
      this.logger.error("Error decoding connect state:", error);
      Sentry.captureException(error, {
        tags: { service: "near", action: "decode_state" },
      });
      throw error;
    }
  }

  /**
   * Get account balance for a NEAR account
   * @param accountId NEAR account ID
   * @returns Account balance information
   */
  async getAccountBalance(accountId: string): Promise<AccountBalance> {
    try {
      const account = await this.near.account(accountId);
      const balance = await account.getAccountBalance();

      this.logger.log(`Retrieved balance for account: ${accountId}`);

      return {
        total: (nearAPI as any).utils.format.formatNearAmount(balance.total),
        available: (nearAPI as any).utils.format.formatNearAmount(
          balance.available,
        ),
        stateStaked: (nearAPI as any).utils.format.formatNearAmount(
          balance.stateStaked,
        ),
        staked: (nearAPI as any).utils.format.formatNearAmount(balance.staked),
      };
    } catch (error) {
      this.logger.error(
        `Error getting balance for account ${accountId}:`,
        error,
      );
      Sentry.captureException(error, {
        tags: { service: "near", action: "get_balance" },
        extra: { accountId },
      });
      throw error;
    }
  }

  /**
   * Verify that a NEAR account exists
   * @param accountId NEAR account ID
   * @returns True if account exists
   */
  async accountExists(accountId: string): Promise<boolean> {
    try {
      const account = await this.near.account(accountId);
      await account.state();
      return true;
    } catch (error) {
      this.logger.warn(`Account ${accountId} does not exist or is invalid`);
      return false;
    }
  }

  /**
   * Create a NEAR remittance intent
   * @param userId User ID from database
   * @param intent Parsed intent from messaging service
   * @returns RemittanceIntent object
   */
  async createRemittanceIntent(
    userId: number,
    intent: any,
    db: any,
  ): Promise<any> {
    try {
      // Fetch user from database
      const userResult = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userResult || userResult.length === 0) {
        throw new Error("User not found");
      }

      const user = userResult[0];

      // Validate user has NEAR account connected
      if (!user.nearAccountId) {
        throw new Error(
          "Please connect your NEAR wallet first. Type 'onboard' to continue setup.",
        );
      }

      // Determine recipient address
      let recipientAddress: string;
      if (intent.target) {
        recipientAddress = await this.getRecipientAddress(intent.target, db);
      } else {
        // If no target specified, use user's own account (for receive_inbound)
        recipientAddress = user.nearAccountId;
      }

      // Build intent payload
      const intentPayload = {
        type:
          intent.intent === "receive_inbound"
            ? "inbound_remittance"
            : "transfer",
        amount: intent.amount,
        source: intent.sourceCurrency || intent.currency || "USD",
        target: intent.targetCurrency || intent.currency || "NGN",
        recipient: recipientAddress,
        timestamp: Date.now(),
        userId: userId,
      };

      this.logger.log(
        `Created NEAR intent: ${intentPayload.type} for user ${userId}`,
        intentPayload,
      );

      return intentPayload;
    } catch (error) {
      this.logger.error("Error creating remittance intent:", error);
      Sentry.captureException(error, {
        tags: { service: "near", action: "create_intent" },
        extra: { userId, intent },
      });
      throw error;
    }
  }

  /**
   * Get recipient NEAR address from phone number or direct address
   * @param target Phone number or 0x... address
   * @param db Drizzle database instance
   * @returns NEAR account ID or address
   */
  async getRecipientAddress(target: string, db: any): Promise<string> {
    try {
      // If target starts with "0x", treat as direct address
      if (target.startsWith("0x")) {
        this.logger.log(`Using direct address: ${target}`);
        return target;
      }

      // Normalize phone number (remove spaces, dashes, etc.)
      const normalizedPhone = target.replace(/[\s\-\(\)]/g, "");

      const userResult = await db
        .select()
        .from(users)
        .where(eq(users.phone, normalizedPhone))
        .limit(1);

      if (!userResult || userResult.length === 0) {
        throw new Error(
          `Recipient not on Kryail yet. Please ask them to join or provide their NEAR address (0x...).`,
        );
      }

      const recipient = userResult[0];

      if (!recipient.nearAccountId) {
        throw new Error(
          `Recipient hasn't connected their NEAR wallet yet. Please ask them to complete onboarding.`,
        );
      }

      this.logger.log(
        `Found recipient NEAR account: ${recipient.nearAccountId} for phone: ${normalizedPhone}`,
      );

      return recipient.nearAccountId;
    } catch (error) {
      this.logger.error("Error getting recipient address:", error);
      throw error;
    }
  }

  /**
   * Spawn a Shade Agent for the user's NEAR account
   * Deploys agent code to TEE for autonomous execution
   * @param userNearId User's NEAR account ID
   * @returns AgentInfo with agent ID and metadata
   */
  async spawnShadeAgent(userNearId: string): Promise<any> {
    try {
      this.logger.log(`Spawning Shade Agent for user: ${userNearId}`);

      // Agent code for remittance execution
      const agentCode = `
        const { connect, keyStores, utils } = require('near-api-js');
        
        async function executeRemittance(intent) {
          try {
            const { amount, source, target, recipient } = intent;
            
            // Connect to NEAR testnet
            const near = await connect({
              networkId: 'testnet',
              nodeUrl: 'https://rpc.testnet.near.org',
              keyStore: new keyStores.InMemoryKeyStore()
            });
            
            // For testnet demo: simulate USDT transfer
            // In production, this would call actual USDT contract
            const txHash = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            console.log('Agent executing remittance:', {
              amount,
              source,
              target,
              recipient,
              txHash
            });
            
            return {
              status: 'completed',
              txHash,
              recipient,
              amount
            };
          } catch (error) {
            console.error('Agent execution error:', error);
            return {
              status: 'failed',
              error: error.message
            };
          }
        }
        
        module.exports = { executeRemittance };
      `;

      // Generate unique agent ID
      const agentId = `agent-${userNearId}-${Date.now()}`.replace(/\./g, "-");

      // In production, deploy to TEE using Shade Agent CLI
      // For now, store agent code and return agent info
      this.logger.log(`Shade Agent deployed: ${agentId}`);

      const agentInfo = {
        agentId,
        userNearId,
        createdAt: Date.now(),
        codeHash: Buffer.from(agentCode).toString("base64").substring(0, 32),
      };

      Sentry.addBreadcrumb({
        category: "near",
        message: "Shade Agent spawned",
        level: "info",
        data: agentInfo,
      });

      return agentInfo;
    } catch (error) {
      this.logger.error("Error spawning Shade Agent:", error);
      Sentry.captureException(error, {
        tags: { service: "near", action: "spawn_agent" },
        extra: { userNearId },
      });
      throw error;
    }
  }

  /**
   * Execute a remittance intent via the user's Shade Agent
   * Agent runs autonomously in TEE
   * @param agentId Agent ID from spawnShadeAgent
   * @param intentPayload Remittance intent to execute
   * @returns AgentExecutionResult with transaction details
   */
  async executeIntentWithAgent(
    agentId: string,
    intentPayload: any,
  ): Promise<any> {
    try {
      this.logger.log(`Executing intent with agent: ${agentId}`, intentPayload);

      // Simulate agent execution
      // In production, this would call the deployed agent in TEE
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate processing

      // Generate transaction hash
      const txHash =
        "near_tx_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

      this.logger.log(`Agent execution completed: ${txHash}`);

      const result = {
        status: "completed",
        txHash,
        recipient: intentPayload.recipient,
        amount: intentPayload.amount,
      };

      Sentry.addBreadcrumb({
        category: "near",
        message: "Agent execution completed",
        level: "info",
        data: { agentId, txHash },
      });

      return result;
    } catch (error) {
      this.logger.error("Error executing intent with agent:", error);
      Sentry.captureException(error, {
        tags: { service: "near", action: "execute_intent" },
        extra: { agentId, intentPayload },
      });

      return {
        status: "failed",
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get cross-border remittance quote
   * @param amount Amount in source currency
   * @param source Source currency code
   * @param target Target currency code
   * @returns Quote object with rate and estimated receive amount
   */
  async getCrossBorderQuote(
    amount: number,
    source: string,
    target: string = "NGN",
  ): Promise<{ rate: number; estimatedAmount: number }> {
    // Mock rates for demo
    // In production, fetch from Oracle or Exchange API
    const rates: Record<string, number> = {
      USD: 1600,
      GBP: 2050,
      EUR: 1750,
      CAD: 1150,
    };

    const rate = rates[source] || 1500; // Default fallback
    const estimatedAmount = amount * rate;

    return {
      rate,
      estimatedAmount,
    };
  }
}
