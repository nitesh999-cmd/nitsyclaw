import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dashboardRoot = resolve(process.cwd());
const nextEnvPath = resolve(dashboardRoot, "next-env.d.ts");
const devRoutesPath = resolve(dashboardRoot, ".next/dev/types/routes.d.ts");
const stableRoutesPath = resolve(dashboardRoot, ".next/types/routes.d.ts");
const devImport = './.next/dev/types/routes.d.ts';
const stableImport = './.next/types/routes.d.ts';

if (!existsSync(nextEnvPath)) {
  throw new Error(`next-env.d.ts not found at ${nextEnvPath}`);
}

if (!existsSync(devRoutesPath) && existsSync(stableRoutesPath)) {
  mkdirSync(dirname(devRoutesPath), { recursive: true });
  copyFileSync(stableRoutesPath, devRoutesPath);
}

if (!existsSync(devRoutesPath)) {
  throw new Error(`Next route typegen did not create ${devRoutesPath} or ${stableRoutesPath}`);
}

const originalSource = readFileSync(nextEnvPath, "utf8");
const devSource = originalSource.replace(
  /import\s+"\.\/\.next\/(?:dev\/)?types\/routes\.d\.ts";/,
  `import "${devImport}";`,
);

const stableSource = originalSource.replace(
  /import\s+"\.\/\.next\/(?:dev\/)?types\/routes\.d\.ts";/,
  `import "${stableImport}";`,
);

try {
  writeFileSync(nextEnvPath, devSource, "utf8");
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "pnpm exec tsc --noEmit"], {
      cwd: dashboardRoot,
      stdio: "inherit",
    })
    : spawnSync("pnpm", ["exec", "tsc", "--noEmit"], {
    cwd: dashboardRoot,
    stdio: "inherit",
    });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
} finally {
  writeFileSync(nextEnvPath, stableSource, "utf8");
}
