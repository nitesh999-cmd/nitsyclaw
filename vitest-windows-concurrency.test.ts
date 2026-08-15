import { availableParallelism } from "node:os";
import { describe, expect, test } from "vitest";
import config, { resolveMaxWorkers } from "./vitest.config";

/**
 * Regression guard for the Windows CI worker cap.
 *
 * Windows CI failed three times on three unrelated tests, each timing out at the
 * 5000ms default. None were slow: the SQLite test that failed at c26ad2c runs in
 * 37ms locally and 62ms on Linux. They were starved of CPU by vitest running
 * about one worker per core on a four-core runner while ollama-recovery.test.ts
 * held cores spawning Windows PowerShell.
 *
 * These assertions fail under exactly that bad configuration — an uncapped
 * Windows worker count — and they are written against the pure resolver rather
 * than the current machine, so the Windows behaviour is verified on the Linux
 * runner too. A guard that only checked `process.platform` would silently pass
 * on Linux and never protect the platform it exists for.
 */

/** The GitHub-hosted Windows runner this suite has to fit inside. */
const WINDOWS_CI_CORES = 4;

describe("windows worker cap", () => {
  test("caps Windows to at most half the available cores", () => {
    // The failing configuration is one worker per core. Anything at or above
    // that ratio reproduces the starvation, so half is asserted as a ceiling.
    for (const cores of [2, 4, 8, 16, 32]) {
      const workers = resolveMaxWorkers("win32", cores);
      expect(workers, `win32/${cores} must be capped`).toBeTypeOf("number");
      expect(workers!).toBeLessThanOrEqual(Math.floor(cores / 2));
      expect(workers! / cores, `win32/${cores} ratio must not reach 1 per core`).toBeLessThanOrEqual(0.5);
    }
  });

  test("gives the four-core Windows CI runner exactly two workers", () => {
    expect(resolveMaxWorkers("win32", WINDOWS_CI_CORES)).toBe(2);
  });

  test("never resolves to zero or a negative worker count", () => {
    // Math.floor(1 / 2) is 0, which would leave vitest unable to run anything.
    expect(resolveMaxWorkers("win32", 1)).toBe(1);
    expect(resolveMaxWorkers("win32", 2)).toBe(1);
    for (const cores of [1, 2, 3, 4, 8, 16, 32]) {
      expect(resolveMaxWorkers("win32", cores)!).toBeGreaterThan(0);
      expect(Number.isInteger(resolveMaxWorkers("win32", cores))).toBe(true);
    }
  });

  test("leaves every non-Windows platform on the default", () => {
    // Linux runs the same 263 files in 3.91s and has never been implicated;
    // capping it would cost wall-clock for no reason.
    for (const platform of ["linux", "darwin", "freebsd"] as const) {
      expect(resolveMaxWorkers(platform, 4), `${platform} must stay uncapped`).toBeUndefined();
    }
  });

  test("is actually wired into the exported vitest config", () => {
    // Without this, the resolver could be correct and unused.
    expect(config.test?.maxWorkers).toBe(resolveMaxWorkers(process.platform, availableParallelism()));
    if (process.platform === "win32") {
      expect(config.test?.maxWorkers, "Windows must run capped").toBeTypeOf("number");
    }
  });
});
