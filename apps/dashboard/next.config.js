/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: ["@nitsyclaw/shared"],
  // R20-aligned: whitelist server-side runtime envs so SSR Server Components
  // and Route Handlers can read them. Without this, Next.js 15 in a workspace
  // monorepo will not propagate process.env to imported workspace packages.
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_DIRECT: process.env.DATABASE_URL_DIRECT ?? "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    WHATSAPP_OWNER_NUMBER: process.env.WHATSAPP_OWNER_NUMBER,
    TIMEZONE: process.env.TIMEZONE,
    MS_CLIENT_ID: process.env.MS_CLIENT_ID,
    MS_TENANT_ID: process.env.MS_TENANT_ID,
    MS_TOKEN_JSON: process.env.MS_TOKEN_JSON ?? "",
    GOOGLE_CREDENTIALS_JSON: process.env.GOOGLE_CREDENTIALS_JSON ?? "",
    GOOGLE_TOKEN_JSON: process.env.GOOGLE_TOKEN_JSON ?? "",
    GOOGLE_TOKEN_SOLARHARBOUR_JSON: process.env.GOOGLE_TOKEN_SOLARHARBOUR_JSON ?? "",
  },
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return cfg;
  },
};
module.exports = config;