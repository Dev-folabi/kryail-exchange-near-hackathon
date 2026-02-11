import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { wallets } from "./wallets.schema";
import { transactions } from "./transactions.schema";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  nearAccountId: varchar("near_account_id", { length: 100 }).unique(),
  pinHash: varchar("pin_hash", { length: 255 }),
  country: varchar("country", { length: 100 }),
  countryCode: varchar("country_code", { length: 10 }),
  regStep: varchar("reg_step", { length: 50 }),
  hasCreatedNearAccount: boolean("has_created_near_account").default(false),
  hasCompletedOnboarding: boolean("has_completed_onboarding").default(false),
  hasCompletedKyc: boolean("has_completed_kyc").default(false),
  hasCompletedPin: boolean("has_completed_pin").default(false),
  jwtRefreshHash: text("jwt_refresh_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  wallets: many(wallets),
  transactions: many(transactions),
}));
