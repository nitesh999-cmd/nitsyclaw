import { describe, expect, it } from "vitest";
import {
  decryptString,
  encryptForStorage,
  encryptString,
  generateKey,
  hashPhone,
  isEncryptedString,
  maskPhone,
} from "../src/utils/crypto.js";

describe("maskPhone", () => {
  it("keeps only a short prefix and the last 4 digits", () => {
    const masked = maskPhone("+919876543210");

    expect(masked).toBe("+91******3210");
    expect(masked).toHaveLength("+919876543210".length);
    expect(masked).not.toContain("987654");
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
    expect(cipher).toMatch(/^enc:v1:/);
    expect(isEncryptedString(cipher)).toBe(true);
    expect(cipher).not.toContain("hello");
    expect(decryptString(cipher, key)).toBe("hello world");
  });

  it("still decrypts legacy unprefixed ciphertext", () => {
    const cipher = encryptString("legacy", key).replace(/^enc:v1:/, "");

    expect(isEncryptedString(cipher)).toBe(false);
    expect(decryptString(cipher, key)).toBe("legacy");
  });

  it("fails decryption with wrong key", () => {
    const otherKey = generateKey();
    const cipher = encryptString("secret", key);
    expect(() => decryptString(cipher, otherKey)).toThrow();
  });

  it("rejects bad key length", () => {
    expect(() => encryptString("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });

  it("requires explicit plaintext opt-in for storage when key is missing", () => {
    expect(() => encryptForStorage("hello", { NODE_ENV: "development" })).toThrow(/ENCRYPTION_KEY/);
    expect(encryptForStorage("hello", {
      NODE_ENV: "development",
      ALLOW_PLAINTEXT_DB: "true",
    })).toBe("hello");
  });
});
