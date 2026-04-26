import { describe, expect, it } from "vitest";
import { decryptString, encryptString, generateKey, hashPhone, maskPhone } from "../src/utils/crypto.js";

describe("maskPhone", () => {
  it("keeps last 4 digits", () => {
    expect(maskPhone("+919876543210")).toBe("+91*****3210");
  });

  it("handles short numbers", () => {
    expect(maskPhone("12")).toBe("****");
  });
});

describe("hashPhone", () => {
  it("is deterministic and short", () => {
    const a = hashPhone("+919876543210");
    const b = hashPhone("+919876543210");
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it("differs across inputs", () => {
    expect(hashPhone("a")).not.toBe(hashPhone("b"));
  });
});

describe("encrypt/decrypt", () => {
  const key = generateKey();
  it("round trips", () => {
    const cipher = encryptString("hello world", key);
    expect(cipher).not.toContain("hello");
    expect(decryptString(cipher, key)).toBe("hello world");
  });

  it("fails decryption with wrong key", () => {
    const otherKey = generateKey();
    const cipher = encryptString("secret", key);
    expect(() => decryptString(cipher, otherKey)).toThrow();
  });

  it("rejects bad key length", () => {
    expect(() => encryptString("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});
