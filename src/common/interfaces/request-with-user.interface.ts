import { Request } from "express";
import { users } from "../../database/schema/users.schema";

export interface RequestWithUser extends Request {
  user: typeof users.$inferSelect;
}
