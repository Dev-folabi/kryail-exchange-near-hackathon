# Kryail Exchange

> WhatsApp AI Wallet for USDT/USDC ⟷ NGN Ramps and NGN → USD/GBP/EUR/CAD Payouts

A production-ready NestJS application providing cryptocurrency exchange services with Afriex integration for fiat rails, built with modern architecture patterns and comprehensive security.

## 🚀 Features

- **Custom JWT + PIN Authentication** - Secure dual-factor authentication system
- **Afriex API Integration** - Fiat on/off ramps with automatic dev/staging mocking
- **Secure Webhook Handling** - RSA-SHA256 signature verification for Afriex events
- **Event-Driven Architecture** - Kafka + BullMQ for async processing with retry logic
- **Database** - Drizzle ORM with PostgreSQL (Supabase)
- **Security** - Helmet, rate limiting, input validation
- **Monitoring** - Sentry integration for error tracking
- **AI Messaging** - WhatsApp bot with LLM intent parsing and Redis session management

## 📋 Project Stages

### ✅ Stage 1: Project Skeleton

- NestJS modular architecture
- Docker Compose for local development
- ESLint, Prettier, Husky pre-commit hooks
- Environment configuration

### ✅ Stage 2: Database Setup

- Drizzle ORM with PostgreSQL
- Schema: Users (onboarding flags), Wallets (multi-asset), Transactions (enums)
- Migrations and type-safe queries

### ✅ Stage 3: Custom Auth & Security

- JWT + PIN authentication
- Bcrypt password hashing
- Helmet security headers
- Rate limiting with @nestjs/throttler

### ✅ Stage 4: Afriex Integration

#### Afriex Service

- **Full API Coverage**: Customers, Payment Methods, Transactions, Balance, Rates
- **Smart Mocking**: Automatic dev/staging mode detection with realistic mock data
- **Error Handling**: Custom exceptions with Sentry logging
- **Type Safety**: Comprehensive DTOs with class-validator

#### Webhook Security

- **RSA-SHA256 Verification**: Cryptographic signature validation
- **Rate Limiting**: 100 requests/minute protection
- **Raw Body Handling**: Signature verification on unmodified request body

#### Event-Driven Architecture

```
Webhook → Signature Verify → Kafka Publish → BullMQ Queue → Processor
                                    ↓                ↓
                              Event Stream    Retry Logic (5x exponential)
```

**Supported Events**:

- `customer.created/updated/deleted`
- `payment_method.created/updated/deleted`
- `transaction.created/updated` (status changes)

### ✅ Stage 5: Messaging & AI (Current)

#### WhatsApp Integration

- **Twilio Webhook**: Secure processing of incoming messages
- **Session Management**: Redis-based state (onboarding steps, last intent)
- **Rate Limiting**: ThrottlerGuard protection

#### Intent Parsing

- **Primary**: OpenRouter LLM (Llama 3.1 8B) for natural language understanding
- **Fallback**: Regex-based parser for reliability when LLM fails or times out
- **Strict JSON**: Prompts optimized for structured data extraction

#### Conversation Flow

- **Onboarding**: Name → PIN → Confirm PIN → KYC (Date of Birth + Country)
- **Commands**: Deposit, Withdraw, Balance, Send, Rate, Help
- **Error Handling**: Conversational, user-friendly error messages

**Example Flow**:

> User: "Hi"
> Bot: "👋 Welcome to Kryail! To get started, please tell me your full name."
> User: "John Doe"
> Bot: "Great, John! Now, please set a 4-digit PIN..."
> ...
> User: "deposit 50k"
> Bot: "💰 To deposit 50000 NGN, transfer to..."

### ✅ Stage 6: NEAR Protocol Migration - Stage 1

#### Overview

Stage 1 of the complete migration from Afriex to NEAR Protocol for remittance infrastructure. This stage establishes the foundation for private, secure remittances powered by Shade Agent on NEAR.

#### Features Implemented

- **NEAR SDK Integration**: `near-api-js` and wallet selector libraries
- **Testnet Configuration**: Full NEAR testnet setup (RPC, wallet, helper, explorer URLs)
- **Wallet Connection Flow**: MyNEARWallet deep link generation and callback handling
- **Database Schema**: Added `near_account_id` column to users table
- **Onboarding Integration**: NEAR wallet connection step after PIN setup
- **Security**: Rate-limited callback endpoint, state validation, expiry checks

#### NEAR Onboarding Flow

```
Name → Email → PIN → NEAR Wallet Connect → KYC → Complete
                            ↓
                    MyNEARWallet Deep Link
                            ↓
                    Callback Updates DB
```

#### Technical Details

- **Deep Link Generation**: Encodes user phone in base64 state parameter
- **State Validation**: 5-minute expiry window, structure validation
- **Account Verification**: Checks NEAR account exists before linking
- **Session Management**: Redis-based tracking of connection state

#### NEAR Module Structure

```
src/near/
├── near.module.ts         # NestJS module registration
├── near.service.ts        # Core NEAR logic (connect, balance, verify)
├── near.controller.ts     # REST endpoints (callback, test balance)
├── near.interface.ts      # TypeScript interfaces and DTOs
└── near.service.spec.ts   # Unit tests
```

#### Environment Variables

```env
# NEAR Protocol (Testnet)
NEAR_NETWORK_ID=testnet
NEAR_NODE_URL=https://rpc.testnet.near.org
NEAR_WALLET_URL=https://wallet.testnet.near.org
NEAR_HELPER_URL=https://helper.testnet.near.org
NEAR_EXPLORER_URL=https://explorer.testnet.near.org
```

#### Migration Notes

> [!IMPORTANT]
> **Stage 1 is Foundation Only**
>
> - This stage only adds NEAR account linking
> - Afriex integration remains active for now
> - Future stages will implement NEAR-based remittances
> - No mainnet configuration yet - testnet only

#### Next Stages (Planned)

- **Stage 2**: NEAR intent creation and Shade Agent spawning
- **Stage 3**: Replace Afriex deposits with NEAR deposits
- **Stage 4**: Replace Afriex withdrawals with NEAR-based payouts
- **Stage 5**: Full Afriex removal and mainnet deployment

## 🛠️ Tech Stack

- **Framework**: NestJS 11
- **Database**: PostgreSQL (Supabase) + Drizzle ORM
- **Caching**: Redis
- **Messaging**: Kafka, BullMQ
- **HTTP Client**: Axios (@nestjs/axios)
- **Security**: Helmet, JWT, Bcrypt, RSA signatures
- **Validation**: class-validator, class-transformer
- **Testing**: Jest, Supertest
- **Monitoring**: Sentry

## 📦 Installation

```bash
npm install
```

## ⚙️ Configuration

Copy `.env.example` to `.env.development`:

```bash
cp .env.example .env.development
```

**Required Environment Variables**:

```env
NODE_ENV=development
DATABASE_URL=postgres://user:pass@host:5432/db

# Afriex API
AFRIX_API_KEY=your_staging_key
AFRIX_BASE_URL=https://staging.afx-server.com
AFRIX_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Kafka
KAFKA_BROKER=localhost:9092

# Security
JWT_SECRET=your_secret_key
SENTRY_DSN=your_sentry_dsn
```

## 🏃 Running the Application

```bash
# Development (with mocking)
npm run start:dev

# Production
npm run start:prod

# Database migrations
npm run db:push
```

## 🧪 Testing

```bash
# All tests
npm test

# Specific test suite
npm test -- afriex.service.spec.ts

# Coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

**Test Coverage**:

- ✅ AfriexService (dev/prod modes, error handling)
- ✅ WebhooksService (signature verification, validation)
- ✅ WebhooksController (integration, all event types)

## 📡 API Endpoints

### Webhooks

```
POST /webhooks/afriex
Headers:
  x-webhook-signature: <base64-rsa-sha256-signature>
Body: { event: string, data: object }
Response: { status: "ok" }
```

## 🔐 Afriex Integration Details

### Development Mode

When `NODE_ENV=development`, all Afriex API calls return mock data:

- Mock customer IDs: `mock_cus_*`
- Mock virtual accounts: `MockBank` with 10-digit account numbers
- Mock crypto wallets: `0x...` addresses for USDT/USDC
- Mock transactions with realistic rates and fees

### Production Mode

Real API calls to Afriex staging/production endpoints with:

- Automatic retry on network failures
- Sentry error logging
- Request/response validation

### Webhook Flow

1. Afriex POSTs event to `/webhooks/afriex`
2. Raw body extracted for signature verification
3. RSA-SHA256 signature validated against public key
4. Valid events published to Kafka topic `afriex.webhook.valid`
5. BullMQ job created with 5 retry attempts (exponential backoff)
6. Processor handles event based on type (update DB, notify user, etc.)

## 📊 Architecture Diagram

```
┌─────────────┐
│   Afriex    │
│   Webhook   │
└──────┬──────┘
       │ POST + signature
       ▼
┌─────────────────┐
│ WebhooksController│
│  - Verify sig    │
│  - Validate      │
└────┬────────────┘
     │
     ├──────────────┐
     ▼              ▼
┌─────────┐   ┌──────────┐
│  Kafka  │   │  BullMQ  │
│ Publish │   │  Queue   │
└─────────┘   └────┬─────┘
                   │ 5 retries
                   ▼
            ┌──────────────┐
            │  Processor   │
            │ - Update DB  │
            │ - Notify User│
            └──────────────┘
```

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'feat: add amazing feature'`
3. Push to branch: `git push origin feature/amazing-feature`
4. Open Pull Request

## 📝 License

This project is proprietary and confidential.

## 🔗 Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Afriex API Docs](https://docs.afriex.com)
- [Drizzle ORM](https://orm.drizzle.team)
