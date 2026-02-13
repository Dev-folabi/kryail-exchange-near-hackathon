import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import * as Sentry from "@sentry/node";
import { NearService } from "./near.service";
import { UsersService } from "../users/users.service";

@Controller("near")
@UseGuards(ThrottlerGuard)
export class NearController {
  private readonly logger = new Logger(NearController.name);

  constructor(
    private readonly nearService: NearService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Handle NEAR wallet connection callback
   * Rate limited to prevent abuse
   */
  @Post("callback")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  async handleCallback(
    @Query("account_id") accountId: string,
    @Query("state") state: string,
    @Query("public_key") publicKey?: string,
    @Query("all_keys") allKeys?: string,
  ) {
    try {
      if (!accountId || !state) {
        throw new HttpException(
          "Missing required parameters",
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`NEAR callback received for account: ${accountId}`);

      // Decode state to get phone number
      const decodedState = this.nearService.decodeConnectState(state);
      const { phone } = decodedState;

      // Find user by phone
      const user = await this.usersService.findByPhone(phone);
      if (!user) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND);
      }

      // Verify account exists on NEAR
      const exists = await this.nearService.accountExists(accountId);
      if (!exists) {
        throw new HttpException(
          "NEAR account does not exist",
          HttpStatus.BAD_REQUEST,
        );
      }

      // Update user's NEAR account ID
      await this.usersService.updateNearAccountId(user.id, accountId);

      this.logger.log(
        `Successfully linked NEAR account ${accountId} to user ${user.id}`,
      );

      return {
        success: true,
        message: "Wallet connected successfully!",
        accountId,
      };
    } catch (error) {
      this.logger.error("Error handling NEAR callback:", error);
      Sentry.captureException(error, {
        tags: { service: "near", action: "callback" },
        extra: { accountId, state },
      });

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        "Failed to connect wallet",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Test endpoint to check NEAR account balance
   * For development/debugging only
   */
  @Get("test-balance/:accountId")
  async getTestBalance(@Param("accountId") accountId: string) {
    try {
      const balance = await this.nearService.getAccountBalance(accountId);
      return {
        accountId,
        balance,
      };
    } catch (error) {
      this.logger.error("Error getting test balance:", error);
      throw new HttpException(
        "Failed to get balance",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
