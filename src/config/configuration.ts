export default () => ({
  port: parseInt(process.env.PORT || "3000", 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber:
      process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886",
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    model:
      process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-nano-30b-a3b:free",
    url:
      process.env.OPENROUTER_URL ||
      "https://openrouter.ai/api/v1/chat/completions",
  },
  sentry: {
    dsn: process.env.SENTRY_DSN,
  },
  imagekit: {
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  },
  near: {
    networkId: process.env.NEAR_NETWORK_ID || "testnet",
    nodeUrl: process.env.NEAR_NODE_URL || "https://rpc.testnet.near.org",
    walletUrl: process.env.NEAR_WALLET_URL || "https://wallet.testnet.near.org",
    helperUrl: process.env.NEAR_HELPER_URL || "https://helper.testnet.near.org",
    explorerUrl:
      process.env.NEAR_EXPLORER_URL || "https://explorer.testnet.near.org",
  },
});
