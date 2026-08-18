import { afterEach, describe, expect, it, vi } from "vitest";

import { extractSqlState, formatSafeLogError, logBotError } from "./safe-log.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatSafeLogError", () => {
  it("redacts contact details and tokens from runtime errors", () => {
    const error = new Error("Failed for nitesh@example.com +61 430 008 008 sk_live_12345678901234567890");

    const safe = formatSafeLogError(error);

    expect(safe).toContain("[redacted:email]");
    expect(safe).toContain("[redacted:phone]");
    expect(safe).toContain("[redacted:token]");
    expect(safe).not.toContain("nitesh@example.com");
    expect(safe).not.toContain("+61 430 008 008");
    expect(safe).not.toContain("sk_live");
  });

  it("redacts context before writing to console", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    logBotError("[test] failed", new Error("bad"), {
      email: "nitesh@example.com",
      phone: "+61 430 008 008",
      label: "voice transcription",
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[test] failed",
      expect.objectContaining({
        email: "[redacted]",
        phone: "[redacted]",
        label: "voice transcription",
      }),
      "Error: bad",
    );
  });
});

describe("SQLSTATE extraction", () => {
  /** Shape Drizzle produces: wrapper message carries the SQL, cause carries the code. */
  function drizzleStyleFailure(code: string, sql: string): Error {
    const driver = Object.assign(new Error("db error"), { code });
    return Object.assign(new Error(`Failed query: ${sql}`), { cause: driver });
  }

  it("surfaces a SQLSTATE from a nested cause", () => {
    const safe = formatSafeLogError(
      drizzleStyleFailure("25006", 'insert into "messages" ("id") values ($1)'),
    );

    expect(safe).toContain("[sqlstate:25006]");
    expect(extractSqlState(drizzleStyleFailure("25006", "x"))).toBe("25006");
  });

  it("walks several levels of cause chain", () => {
    const deepest = Object.assign(new Error("driver"), { code: "08006" });
    const mid = Object.assign(new Error("pool"), { cause: deepest });
    const top = Object.assign(new Error("Failed query: select 1"), { cause: mid });

    expect(extractSqlState(top)).toBe("08006");
  });

  it("puts the SQLSTATE before the message so truncation cannot lose it", () => {
    const long = "x".repeat(5_000);
    const safe = formatSafeLogError(
      Object.assign(new Error(long), { code: "25006" }),
    );

    expect(safe.startsWith("[sqlstate:25006] ")).toBe(true);
    expect(safe).toContain("...[truncated]");
  });

  it("omits malformed or non-Postgres codes", () => {
    for (const code of ["", "2500", "250066", "abcde", "25-06", "EPIPE", "ENOENT", "ECONNRESET"]) {
      expect(extractSqlState(Object.assign(new Error("x"), { code }))).toBeUndefined();
      expect(formatSafeLogError(Object.assign(new Error("x"), { code }))).not.toContain("[sqlstate:");
    }
  });

  it("accepts letter-class SQLSTATEs that Postgres really uses", () => {
    for (const code of ["XX000", "P0001", "HV000", "0A000", "40001", "57P01"]) {
      expect(extractSqlState(Object.assign(new Error("x"), { code }))).toBe(code);
    }
  });

  it("survives a cyclic cause chain without hanging", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;

    expect(extractSqlState(a)).toBeUndefined();
  });

  it("never logs SQL text, bound parameters, or a connection string", () => {
    const safe = formatSafeLogError(
      drizzleStyleFailure(
        "25006",
        'insert into "messages" ("id", "body") values ($1, $2) -- params: ["secret-body"]',
      ),
    );

    expect(safe).toContain("[sql omitted]");
    expect(safe).not.toContain("insert into");
    expect(safe).not.toContain("messages");
    expect(safe).not.toContain("secret-body");

    const withDsn = formatSafeLogError(new Error("connect failed for postgres://user:pw@host:6543/db"));
    expect(withDsn).toContain("[redacted:database-url]");
    expect(withDsn).not.toContain("user:pw");
    expect(withDsn).not.toContain("6543");
  });

  it("handles non-Error values without throwing", () => {
    expect(formatSafeLogError("plain string")).toContain("plain string");
    expect(formatSafeLogError(null)).toBe("null");
    expect(extractSqlState(null)).toBeUndefined();
    expect(extractSqlState("nope")).toBeUndefined();
  });
});
