import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  formatProviderHealthReport,
  getProviderSetupReadiness,
} from "@nitsyclaw/shared/integrations/provider-readiness";

loadLocalEnv([".env.local", "apps/dashboard/.env.local", "apps/bot/.env.local", ".env"]);

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
