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
      // The rendered error now carries stack frames after name/message, so this
      // asserts the prefix rather than the whole line.
      expect.stringContaining("Error: bad"),
    );
  });

  it("stays diagnosable when the throw comes from minified code", () => {
    // A bundled dependency mangles both name and message to the same identifier.
    // Previously this rendered as exactly "r: r", which named nothing and left no
    // way to locate the failing call.
    const minified = new Error("r");
    minified.name = "r";
    minified.stack = "r: r\n    at r (bundle.min.js:1:2345)\n    at t (bundle.min.js:1:9876)";
    Object.assign(minified, { code: "MEDIA_DOWNLOAD_FAILED" });

    const safe = formatSafeLogError(minified);

    expect(safe).toContain("r: r");
    expect(safe).toContain("code=MEDIA_DOWNLOAD_FAILED");
    expect(safe).toContain("bundle.min.js");
    expect(safe).not.toBe("r: r");
  });

  it("does not let one long stack frame evict the frames after it", () => {
    // A real pnpm path is long enough to spend the whole 160-character redaction
    // budget on its own. When the line was redacted as a single string, the first
    // genuine diagnosis this logging produced was cut mid-path, inside the very
    // frame that named the failing call.
    const deep = "at ExecutionContext.#evaluate (C:\\Users\\x\\projects\\app\\node_modules\\.pnpm\\puppeteer-core@25.5.0_yauzl@2.10.0\\node_modules\\puppeteer-core\\lib\\cjs\\puppeteer\\cdp\\ExecutionContext.js:391:56)";
    const error = new Error("r");
    error.name = "r";
    error.stack = [`r: r`, `    ${deep}`, "    at async Message.downloadMedia (wwebjs.js:1:1)"].join("\n");

    const safe = formatSafeLogError(error);

    expect(safe).toContain("ExecutionContext");
    // The frame after the long one must survive.
    expect(safe).toContain("downloadMedia");
  });

  it("still redacts secrets inside stack frames", () => {
    const error = new Error("boom");
    error.stack = [
      "Error: boom",
      "    at handler (/srv/app.js:1:1) token=sk_live_12345678901234567890",
      "    at next (/srv/app.js:2:2) user=nitesh@example.com",
    ].join("\n");

    const safe = formatSafeLogError(error);

    expect(safe).not.toContain("sk_live_12345678901234567890");
    expect(safe).not.toContain("nitesh@example.com");
    expect(safe).toContain("[redacted:token]");
    expect(safe).toContain("[redacted:email]");
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
