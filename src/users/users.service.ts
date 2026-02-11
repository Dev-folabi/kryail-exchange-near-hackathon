import { Injectable, Inject } from "@nestjs/common";
import * as databaseModule from "../database/database.module";
import { users } from "../database/schema/users.schema";
import { eq } from "drizzle-orm";

@Injectable()
export class UsersService {
  constructor(
    @Inject(databaseModule.DRIZZLE) private db: databaseModule.DrizzleDB,
  ) {}

  async findById(id: number) {
    const results = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return results[0];
  }

  async findByPhone(phone: string) {
    const results = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    return results[0];
  }

  async create(data: typeof users.$inferInsert) {
    const results = await this.db.insert(users).values(data).returning();
    if (!results[0]) {
      throw new Error("Failed to create user");
    }
    return results[0];
  }

  async updateRefreshHash(id: number, hash: string | null) {
    await this.db
      .update(users)
      .set({ jwtRefreshHash: hash })
      .where(eq(users.id, id));
  }

  async updateNearAccountId(id: number, nearAccountId: string) {
    await this.db
      .update(users)
      .set({ nearAccountId: nearAccountId })
      .where(eq(users.id, id));
  }
}
