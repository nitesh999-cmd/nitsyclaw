import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake driver: no sockets, and every close is recorded so double-closes show up.
const state = vi.hoisted(() => ({
  created: [] as string[],
  ends: [] as string[],
}));

vi.mock("postgres", () => ({
  default: vi.fn((url: string) => {
    state.created.push(url);
    return {
      __url: url,
      end: vi.fn(async () => {
        state.ends.push(url);
      }),
    };
  }),
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn((client: { __url: string }) => ({ __client: client })),
}));

import { closeDb, getDb, resetDbCache } from "../src/db/client.js";

const URL_A = "postgres://user:pw@host-a:6543/db_a";
const URL_B = "postgres://user:pw@host-b:6543/db_b";

function clientUrlOf(db: unknown): string {
  return (db as { __client: { __url: string } }).__client.__url;
}

describe("getDb client cache", () => {
  beforeEach(async () => {
    await closeDb();
    state.created.length = 0;
    state.ends.length = 0;
  });

  it("returns the same client for repeated calls with the same explicit URL", () => {
    const first = getDb(URL_A);
    const second = getDb(URL_A);
    const third = getDb(URL_A);

    expect(second).toBe(first);
    expect(third).toBe(first);
    // One pool, not three — the old single-slot cache built a new one every call.
    expect(state.created).toHaveLength(1);
  });

  it("keeps different URLs isolated and never returns the wrong client", () => {
    const a = getDb(URL_A);
    const b = getDb(URL_B);

    expect(a).not.toBe(b);
    expect(clientUrlOf(a)).toBe(URL_A);
    expect(clientUrlOf(b)).toBe(URL_B);
    expect(getDb(URL_A)).toBe(a);
    expect(getDb(URL_B)).toBe(b);
    expect(state.created).toHaveLength(2);
  });

  it("falls back to DATABASE_URL and shares that client with an identical explicit URL", () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = URL_A;
    try {
      const implicit = getDb();
      expect(getDb(URL_A)).toBe(implicit);
      expect(state.created).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it("throws when no connection string is available", () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => getDb()).toThrow("DATABASE_URL is required");
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });
});

describe("closeDb", () => {
  beforeEach(async () => {
    await closeDb();
    state.created.length = 0;
    state.ends.length = 0;
  });

  it("closes every cached client exactly once", async () => {
    getDb(URL_A);
    getDb(URL_B);
    getDb(URL_A);

    await closeDb();

    expect(state.ends).toHaveLength(2);
    expect(new Set(state.ends)).toEqual(new Set([URL_A, URL_B]));
  });

  it("is idempotent — repeated calls are safe and close nothing twice", async () => {
    getDb(URL_A);

    await closeDb();
    await closeDb();
    await closeDb();

    expect(state.ends).toEqual([URL_A]);
  });

  it("does not double-close when called concurrently", async () => {
    getDb(URL_A);
    getDb(URL_B);

    await Promise.all([closeDb(), closeDb(), closeDb()]);

    expect(state.ends).toHaveLength(2);
  });

  it("builds a fresh client after close, so the process can reconnect", async () => {
    const before = getDb(URL_A);
    await closeDb();
    const after = getDb(URL_A);

    expect(after).not.toBe(before);
    expect(state.created).toHaveLength(2);
  });

  it("resolves even when a client fails to close", async () => {
    const db = getDb(URL_A);
    const client = (db as unknown as { __client: { end: ReturnType<typeof vi.fn> } }).__client;
    client.end.mockRejectedValueOnce(new Error("socket already gone"));

    await expect(closeDb()).resolves.toBeUndefined();
  });

  it("resetDbCache drops references without closing, so closeDb has nothing left to do", async () => {
    getDb(URL_A);

    resetDbCache();
    await closeDb();

    expect(state.ends).toHaveLength(0);
  });
});
