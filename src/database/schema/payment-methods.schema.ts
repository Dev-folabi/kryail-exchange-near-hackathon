import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.schema";

export const paymentMethodTypeEnum = pgEnum("payment_method_type", [
  "virtual_account",
  "crypto_wallet",
]);

export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  externalPaymentMethodId: varchar("external_payment_method_id", {
    length: 255,
  }),
  type: paymentMethodTypeEnum("type").notNull(),
  currency: varchar("currency", { length: 20 }),
  asset: varchar("asset", { length: 20 }),

  institutionName: varchar("institution_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 50 }),
  accountName: varchar("account_name", { length: 255 }),

  address: varchar("address", { length: 255 }),
  network: varchar("network", { length: 50 }),

  metadata: jsonb("metadata").default({}),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const paymentMethodsRelations = relations(paymentMethods, ({ one }) => ({
  user: one(users, {
    fields: [paymentMethods.userId],
    references: [users.id],
  }),
}));
