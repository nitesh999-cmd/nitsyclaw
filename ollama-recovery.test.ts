import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Durable Ollama startup and recovery safeguard.
 *
 * The behavioural tests drive scripts/ensure-ollama.ps1 through
 * scripts/ensure-ollama-testdriver.ps1, which injects fake probe, process,
 * executable, starter and model seams. No real Ollama server, port, process or
 * executable is touched, so these are safe to run while the live service is up.
 */

const DRIVER = "scripts/ensure-ollama-testdriver.ps1";
const HELPER = "scripts/ensure-ollama.ps1";
const DRIVER_ABS = join(process.cwd(), DRIVER);

/**
 * Strip PowerShell comments so "must not contain" assertions test code, not
 * prose. The helper deliberately documents what it must never bind to; that
 * documentation must not be what makes these assertions pass or fail.
 */
function psCode(path: string): string {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => (line.trim().startsWith("#") ? "" : line))
    .join("\n");
}

interface DriverResult {
  scenario: string;
  code: number;
  starts: number;
  childHost: string;
  parentHostAfter: string;
  healthMarker: boolean;
  log: string;
}

function runScenario(scenario: string, stateDir?: string): DriverResult {
  const dir = stateDir ?? mkdtempSync(join(tmpdir(), "nitsy-ollama-"));
  try {
    const out = execFileSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", DRIVER, "-Scenario", scenario, "-StateDir", dir],
      { encoding: "utf8", timeout: 60_000 },
    );
    const line = out.trim().split(/\r?\n/).filter(Boolean).pop() ?? "{}";
    return JSON.parse(line) as DriverResult;
  } finally {
    if (!stateDir) rmSync(dir, { recursive: true, force: true });
  }
}

// Documented exit-code contract from scripts/ensure-ollama.ps1.
const OK = 0;
const EXE_NOT_FOUND = 10;
const START_TIMEOUT = 11;
const MODEL_MISSING = 12;

// These execute scripts/ensure-ollama.ps1 through Windows PowerShell against a
// simulated server, so they are Windows-only by construction. The safety-contract
// and wiring blocks below read the script as source and stay cross-platform, which
// keeps the guarantees that matter on every runner.
describe.skipIf(process.platform !== "win32")("ensure-ollama behaviour", () => {
  test("a healthy Ollama causes zero starts", () => {
    const r = runScenario("healthy");
    expect(r.code).toBe(OK);
    expect(r.starts).toBe(0);
    expect(r.healthMarker).toBe(true);
    expect(r.log).toContain("already_running");
  }, 60_000);

  test("a missing Ollama causes exactly one start", () => {
    const r = runScenario("missing");
    expect(r.code).toBe(OK);
    expect(r.starts).toBe(1);
    expect(r.log).toContain("ok started");
  }, 60_000);

  test("an existing starting process is awaited, not duplicated", () => {
    const r = runScenario("existing-starting");
    expect(r.code).toBe(OK);
    expect(r.starts).toBe(0);
    expect(r.log).toContain("awaiting_existing");
  }, 60_000);

  test("startup timeout returns the documented bounded error", () => {
    for (const scenario of ["start-timeout", "never-ready"]) {
      const r = runScenario(scenario);
      expect(r.code, scenario).toBe(START_TIMEOUT);
      expect(r.healthMarker, scenario).toBe(false);
      expect(r.log, scenario).toContain("start_timeout");
    }
  }, 90_000);

  test("a missing executable returns the documented bounded error", () => {
    const r = runScenario("exe-missing");
    expect(r.code).toBe(EXE_NOT_FOUND);
    expect(r.starts).toBe(0);
    expect(r.log).toContain("exe_not_found");
  }, 60_000);

  test("a missing required model fails and never pulls anything", () => {
    const r = runScenario("model-missing");
    expect(r.code).toBe(MODEL_MISSING);
    expect(r.starts).toBe(0);
    expect(r.healthMarker).toBe(false);
    expect(r.log).toContain("model_missing");
    // The helper must contain no pull/install/remove verb at all.
    const helper = readFileSync(HELPER, "utf8");
    expect(helper).not.toMatch(/ollama\s+(pull|run|rm|create|cp|push)/i);
    expect(helper).not.toMatch(/\/api\/pull|\/api\/create|\/api\/delete/i);
  }, 60_000);

  test("the child is configured for loopback only", () => {
    const r = runScenario("missing");
    expect(r.childHost).toBe("127.0.0.1:11434");
    const helper = psCode(HELPER);
    expect(helper).toContain("127.0.0.1:11434");
    expect(helper).toContain("http://127.0.0.1:11434");
    // No public or LAN bind, ever (comments stripped, so this tests code only).
    expect(helper).not.toContain("0.0.0.0");
    expect(helper).not.toMatch(/OLLAMA_HOST\s*=\s*['"]?(?!127\.0\.0\.1)\d/);
  }, 60_000);

  test("the parent environment is restored after starting a child", () => {
    for (const scenario of ["healthy", "missing", "never-ready", "exe-missing"]) {
      const r = runScenario(scenario);
      expect(r.parentHostAfter, scenario).toBe("PARENT-SENTINEL");
    }
  }, 120_000);

  test("no raw exception text or environment value reaches the log", () => {
    for (const scenario of ["missing", "never-ready", "exe-missing", "model-missing"]) {
      const r = runScenario(scenario);
      expect(r.log, scenario).not.toMatch(/Exception|System\.|at line|StackTrace|\+ CategoryInfo/i);
      expect(r.log, scenario).not.toContain("PARENT-SENTINEL");
      expect(r.log, scenario).not.toMatch(/C:\\/);
      // Only bounded status tokens.
      for (const line of r.log.split(/\r?\n/).filter(Boolean)) {
        expect(line, line).toMatch(
          /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] ensure-ollama: (ok|awaiting_existing|start_timeout|exe_not_found|model_missing|lock_busy|unexpected)( [A-Za-z0-9_=,.]*)?$/,
        );
      }
    }
  }, 120_000);

  test("two concurrent ensure calls cause exactly one start", () => {
    const dir = mkdtempSync(join(tmpdir(), "nitsy-ollama-conc-"));
    try {
      // Start-Job does not inherit the caller's working directory, so the
      // driver is addressed absolutely.
      const drv = DRIVER_ABS.replace(/'/g, "''");
      const script =
        `$d='${dir.replace(/'/g, "''")}'; $p='${drv}';` +
        `$j1=Start-Job { param($x,$s) & powershell -ExecutionPolicy Bypass -NoProfile -File $s -Scenario concurrent -StateDir $x } -ArgumentList $d,$p;` +
        `$j2=Start-Job { param($x,$s) & powershell -ExecutionPolicy Bypass -NoProfile -File $s -Scenario concurrent -StateDir $x } -ArgumentList $d,$p;` +
        `Receive-Job -Job $j1,$j2 -Wait -AutoRemoveJob | Out-Null;` +
        `@(Get-Content (Join-Path $d 'starts.txt') -EA SilentlyContinue | Where-Object { $_ -eq 'start' }).Count`;
      const out = execFileSync(
        "powershell",
        ["-ExecutionPolicy", "Bypass", "-NoProfile", "-Command", script],
        { encoding: "utf8", timeout: 120_000, cwd: process.cwd() },
      );
      const starts = Number(out.trim().split(/\r?\n/).filter(Boolean).pop());
      expect(starts).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});

describe("ensure-ollama safety contract", () => {
  const helper = readFileSync(HELPER, "utf8");

  test("never kills, stops or restarts an Ollama process", () => {
    expect(helper).not.toMatch(/Stop-Process/i);
    expect(helper).not.toMatch(/taskkill/i);
    expect(helper).not.toMatch(/\.Kill\(\)/i);
  });

  test("starts only 'ollama serve', detached and hidden", () => {
    expect(helper).toContain("-ArgumentList 'serve'");
    expect(helper).toContain("-WindowStyle Hidden");
    expect(helper).not.toMatch(/-Wait\b/);
  });

  test("documents a stable exit-code contract", () => {
    for (const token of ["OK", "EXE_NOT_FOUND", "START_TIMEOUT", "MODEL_MISSING", "LOCK_BUSY", "UNEXPECTED"]) {
      expect(helper).toContain(token);
    }
    expect(helper).toContain("$script:ExitOk = 0");
    expect(helper).toContain("$script:ExitExeNotFound = 10");
    expect(helper).toContain("$script:ExitStartTimeout = 11");
    expect(helper).toContain("$script:ExitModelMissing = 12");
    expect(helper).toContain("$script:ExitLockBusy = 13");
  });

  test("uses a cross-process lock and bounded timeouts", () => {
    expect(helper).toContain("[System.IO.File]::Open");
    expect(helper).toContain("'OpenOrCreate', 'ReadWrite', 'None'");
    expect(helper).toContain("$StartTimeoutSeconds");
    expect(helper).toContain("$LockWaitSeconds");
    expect(helper).toContain("$ProbeTimeoutSeconds");
  });

  test("requires the configured model and writes the marker only on success", () => {
    expect(helper).toContain("qwen3:8b");
    expect(helper.indexOf("Write-OllamaHealthMarker -Model")).toBeGreaterThan(
      helper.indexOf("if ($models -notcontains $RequiredModel)"),
    );
  });
});

describe("recovery wiring", () => {
  const launcher = readFileSync("launch-bot.ps1", "utf8");
  const broom = readFileSync("broom.ps1", "utf8");

  test("the launcher calls the shared helper before starting the bot", () => {
    expect(launcher).toContain("scripts\\ensure-ollama.ps1");
    expect(launcher.indexOf("ensure-ollama.ps1")).toBeLessThan(
      launcher.indexOf("pnpm --filter @nitsyclaw/bot start"),
    );
  });

  test("an Ollama failure never blocks the launcher's bot start", () => {
    expect(launcher).toContain("ollama degraded code=");
    expect(launcher).toContain("starting bot anyway");
    // The bot spawn must not sit inside a conditional on the Ollama result.
    const afterCheck = launcher.slice(launcher.indexOf("ollama degraded code="));
    expect(afterCheck).toContain("pnpm --filter @nitsyclaw/bot start");
  });

  test("broom calls the same helper on its normal cycle", () => {
    expect(broom).toContain("scripts\\ensure-ollama.ps1");
    expect(broom).toContain("bot recovery unaffected");
  });

  test("broom's Ollama step cannot stop or restart a healthy bot", () => {
    const start = broom.indexOf("ensure-ollama.ps1");
    const end = broom.indexOf("if ($bot.Count -eq 0)");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = broom.slice(start, end);
    expect(block).not.toMatch(/Stop-ProcessTree|Restart-Bot|Start-Bot/);
  });

  test("broom keeps every existing bot recovery rule", () => {
    for (const rule of [
      "Get-BotRuntimeProcesses",
      "Test-LocalWhatsAppAllowed",
      "Confirm-BotRestart",
      "Restart-Bot",
      "Write-WatchdogHeartbeat",
      "whatsapp-health-last-ok.txt",
      "restart suppressed by",
    ]) {
      expect(broom, rule).toContain(rule);
    }
  });

  test("no new scheduled task and no trigger change", () => {
    for (const source of [launcher, broom, readFileSync(HELPER, "utf8")]) {
      expect(source).not.toMatch(/Register-ScheduledTask|New-ScheduledTask|schtasks/i);
      expect(source).not.toMatch(/PT2M|Set-ScheduledTask/i);
    }
  });

  test("Railway behaviour and the runtime ownership guard are untouched", () => {
    for (const source of [launcher, broom, readFileSync(HELPER, "utf8")]) {
      expect(source).not.toMatch(/RAILWAY_/);
      expect(source).not.toMatch(/NITSYCLAW_WHATSAPP_RUNTIME_OWNER/);
    }
    // The guard still gates the local runtime exactly as before.
    expect(launcher).toContain("NITSYCLAW_ALLOW_LOCAL_WHATSAPP");
    expect(broom).toContain("NITSYCLAW_ALLOW_LOCAL_WHATSAPP");
  });

  test("the helper is Windows-local only and adds no non-Windows path", () => {
    const helper = readFileSync(HELPER, "utf8");
    expect(helper).toContain("LOCALAPPDATA");
    expect(helper).toContain("ProgramFiles");
    expect(helper).not.toMatch(/\/usr\/|\/opt\/|systemctl|launchctl/i);
  });
});
