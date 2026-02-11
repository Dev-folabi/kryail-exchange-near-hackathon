import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nearAPI from "near-api-js";
import * as Sentry from "@sentry/node";
import { NearConfig, ConnectState, AccountBalance } from "./near.interface";

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
}
