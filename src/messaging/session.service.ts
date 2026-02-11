import { Injectable, Inject, Logger } from "@nestjs/common";
import Redis from "ioredis";
import { SessionData } from "./messaging.interface";

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly SESSION_PREFIX = "session:";
  private readonly DEFAULT_TTL = 1800; // 30 minutes

  constructor(@Inject("REDIS_CLIENT") private readonly redis: Redis) {}

  /**
   * Get session data for a phone number
   */
  async getSession(phone: string): Promise<SessionData | null> {
    try {
      const key = this.getKey(phone);
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as SessionData;
    } catch (error) {
      this.logger.error(`Failed to get session for ${phone}:`, error);
      return null;
    }
  }

  /**
   * Set session data for a phone number
   */
  async setSession(
    phone: string,
    data: SessionData,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    try {
      const key = this.getKey(phone);
      await this.redis.setex(key, ttl, JSON.stringify(data));
      this.logger.debug(
        `Session set for ${phone}, with data ${data} with TTL ${ttl}s`,
      );
    } catch (error) {
      this.logger.error(`Failed to set session for ${phone}:`, error);
      throw error;
    }
  }

  /**
   * Update session data (merge with existing)
   */
  async updateSession(
    phone: string,
    partial: Partial<SessionData>,
  ): Promise<void> {
    try {
      const existing = (await this.getSession(phone)) || {};
      const updated = { ...existing, ...partial };
      await this.setSession(phone, updated);
      this.logger.debug(`Session updated for ${phone}, with data ${updated}`);
    } catch (error) {
      this.logger.error(`Failed to update session for ${phone}:`, error);
      throw error;
    }
  }

  /**
   * Delete session data
   */
  async deleteSession(phone: string): Promise<void> {
    try {
      const key = this.getKey(phone);
      await this.redis.del(key);
      this.logger.debug(`Session deleted for ${phone}`);
    } catch (error) {
      this.logger.error(`Failed to delete session for ${phone}:`, error);
      throw error;
    }
  }

  /**
   * Get Redis key for phone number
   */
  private getKey(phone: string): string {
    return `${this.SESSION_PREFIX}${phone}`;
  }
}
