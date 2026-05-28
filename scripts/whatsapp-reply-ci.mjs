import { spawnSync } from "node:child_process";

function pnpmCommand(args) {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...args],
      shell: false,
    };
  }

  return process.platform === "win32"
    ? {
        command: process.env.ComSpec ?? "cmd.exe",
        args: ["/d", "/s", "/c", "pnpm", ...args],
        shell: false,
      }
    : { command: "pnpm", args, shell: false };
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
]));
