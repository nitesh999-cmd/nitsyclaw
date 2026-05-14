import { describe, expect, it } from "vitest";
import { detectIntent, parseExpenseText } from "../src/utils/parse.js";

describe("detectIntent", () => {
  it.each([
    ["remind me to call mom at 7pm", "set_reminder"],
    ["good morning, brief me", "morning_brief"],
    ["what's on my plate today", "whats_on_my_plate"],
    ["where did I save the article about claude", "memory_recall"],
    ["schedule a call with priya", "schedule_call"],
    ["look up the latest on solar tariffs", "web_research"],
    ["spent 200 on coffee", "log_expense"],
    ["yes", "confirmation"],
    ["n", "confirmation"],
    ["random nonsense without keywords", "unknown"],
  ])("classifies %j as %s", (text, intent) => {
    expect(detectIntent(text)).toBe(intent);
  });
});

describe("parseExpenseText", () => {
  it("extracts amount only", () => {
    expect(parseExpenseText("paid 99")).toEqual({
      amountCents: 9900,
      currency: "AUD",
    });
  });

  it("extracts amount + category + merchant", () => {
    expect(parseExpenseText("spent 250 on coffee at Starbucks")).toEqual({
      amountCents: 25000,
      currency: "AUD",
      category: "coffee",
      merchant: "Starbucks",
    });
  });

  it("treats plain dollar amounts as the user's default currency", () => {
    const r = parseExpenseText("paid $12.50 for lunch");
    expect(r?.amountCents).toBe(1250);
    expect(r?.currency).toBe("AUD");
  });

  it("keeps explicit USD and INR currencies", () => {
    expect(parseExpenseText("paid USD 12.50 for lunch")?.currency).toBe("USD");
    expect(parseExpenseText("paid US$12.50 for lunch")?.currency).toBe("USD");
    expect(parseExpenseText("paid ₹99 for lunch")?.currency).toBe("INR");
    expect(parseExpenseText("paid rs 99 for lunch")?.currency).toBe("INR");
  });

  it("returns null when no amount", () => {
    expect(parseExpenseText("nothing to see")).toBeNull();
  });

  it("handles decimals", () => {
    expect(parseExpenseText("paid 12.34")).toMatchObject({ amountCents: 1234 });
  });
});
