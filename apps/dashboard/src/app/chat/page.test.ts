import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard chat approval receipt", () => {
  it("does not replay a receipt-only request through the fallback endpoint", () => {
    const source = readFileSync("apps/dashboard/src/app/chat/page.tsx", "utf8");
    expect(source).toContain("let sawReceipt = false");
    expect(source).toContain("sawReceipt = true");
    expect(source).toContain("!finalText && !sawError && !sawReceipt");
  });
});
