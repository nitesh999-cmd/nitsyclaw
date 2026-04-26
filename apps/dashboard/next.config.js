/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  experimental: { serverActions: { allowedOrigins: ["localhost:3000"] } },
  transpilePackages: ["@nitsyclaw/shared"],
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return cfg;
  },
};
module.exports = config;