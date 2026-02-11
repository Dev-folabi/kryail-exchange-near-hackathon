import { Controller, Get, Inject } from "@nestjs/common";
import { AppService } from "./app.service";
import * as databaseModule from "./database/database.module";
import { users } from "./database/schema";

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject(databaseModule.DRIZZLE)
    private readonly db: databaseModule.DrizzleDB,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get("test-db")
  async testDb() {
    const result = await this.db.select().from(users).limit(1);
    return { users: result };
  }
}
