import { spawnSync } from "node:child_process";

const testNamePattern =
  "Saved|working receipt|what can you do|ready pending setup status|pending items|local files|provider readiness|capability|self-test|incident summary|canary|WhatsApp reply format";
const isWindows = process.platform === "win32";

function pnpmCommand(args) {
  if (!isWindows) {
    return { command: "pnpm", args, shell: false };
  }

  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", "pnpm", ...args],
    shell: false,
  };
}

function run(label, commandSpec) {
  const { command, args, shell } = commandSpec;
  console.log(`== ${label} ==`);
  console.log([command, ...args].join(" "));
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell,
  });

  if (result.error) {
    console.error(`${label} failed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
    process.exit(result.status ?? 1);
  }
}

run("WhatsApp reply shape report", pnpmCommand(["run", "whatsapp:reply-shape-report"]));
run("WhatsApp reply shape tests", pnpmCommand([
  "exec",
  "vitest",
  "run",
  "apps/bot/test/router.integration.test.ts",
  "apps/bot/src/whatsapp-provider-readiness.test.ts",
  "apps/bot/src/whatsapp-capability-registry.test.ts",
  "apps/bot/src/whatsapp-reply-format.test.ts",
  "--testNamePattern",
  testNamePattern,
]));
