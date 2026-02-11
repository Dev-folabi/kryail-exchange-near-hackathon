import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  ValidationPipe,
} from "@nestjs/common";
import express from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LocalAuthGuard } from "../common/guards/local-auth.guard";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { UserWithoutSensitiveInfo } from "./auth.service";

interface RequestWithUser extends express.Request {
  user: UserWithoutSensitiveInfo;
}

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  async register(@Body(new ValidationPipe()) registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(LocalAuthGuard)
  @Post("login")
  async login(@Request() req: RequestWithUser) {
    return this.authService.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post("refresh")
  async refresh(
    @Request() req: RequestWithUser,
    @Body("refresh_token") refreshToken: string,
  ) {
    return this.authService.refresh(req.user.id, refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("profile")
  getProfile(@Request() req: RequestWithUser) {
    return req.user;
  }
}
