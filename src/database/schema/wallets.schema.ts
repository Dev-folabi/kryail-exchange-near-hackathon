import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.schema";

export const assetEnum = pgEnum("asset_type", [
  "USDT",
  "USDC",
  "NGN",
  "EUR",
  "GBP",
  "USD",
  "CAD",
]);

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  asset: assetEnum("asset").notNull(),
  balance: numeric("balance", { precision: 18, scale: 6 })
    .notNull()
    .default("0"),
  address: varchar("address", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
}));
