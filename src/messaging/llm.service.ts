import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import * as Sentry from "@sentry/node";
import { ParsedIntent, SessionData } from "./messaging.interface";

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>("openrouter.apiKey") || "";
    this.model =
      this.configService.get<string>("openrouter.model") ||
      "meta-llama/llama-3.1-8b-instruct:free";
    this.baseUrl = this.configService.get<string>("openrouter.url") || "";
  }

  /**
   * Parse user message into structured intent using OpenRouter LLM
   * Returns null on any error to trigger fallback parser
   */
  async parseIntent(
    message: string,
    context?: SessionData,
  ): Promise<ParsedIntent | null> {
    try {
      const prompt = this.buildPrompt(message, context);

      this.logger.debug(`Sending message to OpenRouter: ${message}`);

      const response = await firstValueFrom(
        this.httpService.post(
          this.baseUrl,
          {
            model: this.model,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 15000,
          },
        ),
      );

      const content = response.data?.choices?.[0]?.message?.content;

      if (!content) {
        this.logger.warn("No content in OpenRouter response", content);
        return null;
      }

      // Try to parse JSON response
      const parsed = JSON.parse(content.trim());

      // Validate structure
      if (!parsed.intent || typeof parsed.intent !== "string") {
        this.logger.warn("Invalid intent structure from LLM", parsed);
        return null;
      }

      this.logger.debug(`LLM parsed intent: ${parsed.intent}`, parsed);
      return parsed as ParsedIntent;
    } catch (error: any) {
      this.logger.error(
        `LLM parsing failed: ${error.message}`,
        error.response?.data || error.stack,
      );

      // Log to Sentry
      Sentry.captureException(error, {
        tags: {
          service: "llm",
          model: this.model,
        },
        extra: {
          message,
          context,
        },
      });

      return null;
    }
  }

  /**
   * Build prompt for LLM with strict JSON output requirement
   */
  private buildPrompt(message: string, context?: SessionData): string {
    let contextInfo = "";

    if (context?.onboardingStep && context.onboardingStep !== "complete") {
      contextInfo = `\nContext: User is in onboarding step "${context.onboardingStep}".`;
    }

    return `You are a private remittance agent on NEAR Protocol. Parse user message into JSON only. Supported intents:
- "receive_inbound": Receiving foreign fiat to NGN (e.g. "receive 100 USD", "get 200 EUR in NGN", "incoming 150 CAD to my wallet")
- "send": Sending USDT/USDC/NGN (e.g. "send 50 USDT to 0x..." or "to +234...")
- "deposit": Deposit funds to wallet
- "withdraw": Withdraw funds from wallet
- "balance": Check wallet balances
- "rate": Check exchange rates
- "help", "set_pin", "onboard", "unknown"

Return ONLY this JSON structure:
{
  "intent": "receive_inbound" | "send" | "deposit" | "withdraw" | "balance" | "rate" | "help" | "onboard" | "set_pin" | "unknown",
  "amount": number | null,
  "currency": "NGN" | "USDT" | "USDC" | "USD" | "GBP" | "EUR" | "CAD" | null,
  "sourceCurrency": "USD" | "GBP" | "EUR" | "CAD" | "NGN" | null,
  "targetCurrency": "NGN" | "USDT" | "USDC" | null,
  "target": string | null,
  "step": "name" | "pin" | "confirm_pin" | "kyc" | null,
  "extractedDetails": {
    "firstName": string | null,
    "lastName": string | null,
    "email": string | null,
    "dob": string | null,
    "country": string | null
  }
}
No extra text, no markdown.${contextInfo}

User message: "${message}"`;
  }
}
