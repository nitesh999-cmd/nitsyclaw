import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  formatProviderHealthReport,
  getProviderSetupReadiness,
} from "@nitsyclaw/shared/integrations/provider-readiness";

loadLocalEnv([".env.local", "apps/dashboard/.env.local", "apps/bot/.env.local", ".env"]);
loadLocalEnv([resolve(secretRoot(), ".env.local")]);
markSecretFilesPresent(process.env);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const readiness = getProviderSetupReadiness(process.env);
  console.log(formatProviderHealthReport(readiness));
}

function loadLocalEnv(paths: string[]): void {
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key]) continue;
      process.env[key] = unquoteEnvValue(line.slice(eq + 1).trim());
    }
  }
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function secretRoot(): string {
  return process.env.NITSYCLAW_SECRET_ROOT || resolve(homedir(), ".nitsyclaw", "secrets");
}

function markSecretFilesPresent(env: NodeJS.ProcessEnv): void {
  const root = secretRoot();
  if (!existsSync(root)) return;

  if (!env.GOOGLE_CREDENTIALS_JSON && existsSync(resolve(root, "google-credentials.json"))) {
    env.GOOGLE_CREDENTIALS_JSON = "__secret_file_present__";
  }

  const files = readdirSync(root);
  const hasGoogleTokenFile = files.some((file) => /^google-token(?:-[a-z0-9_-]+)?\.json$/i.test(file));
  if (!env.GOOGLE_TOKEN_JSON && !Object.keys(env).some((key) => key.startsWith("GOOGLE_TOKEN_JSON_")) && hasGoogleTokenFile) {
    env.GOOGLE_TOKEN_JSON_PERSONAL = "__secret_file_present__";
  }

  if (!env.MS_TOKEN_JSON && existsSync(resolve(root, "ms-token.json"))) {
    env.MS_TOKEN_JSON = "__secret_file_present__";
  }
}
