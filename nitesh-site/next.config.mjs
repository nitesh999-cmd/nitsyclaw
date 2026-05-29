import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // This app lives inside a larger monorepo; pin the tracing root to itself
  // so Next does not infer the parent repo's lockfile as the workspace root.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
