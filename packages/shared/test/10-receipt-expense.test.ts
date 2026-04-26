import { describe, expect, it } from "vitest";
import {
  categorizeExpense,
  processReceiptImage,
  registerReceiptExpense,
} from "../src/features/10-receipt-expense.js";
import { makeFakeDb, fakeImageAnalyzer, makeAgentDeps } from "./helpers.js";
import { ToolRegistry } from "../src/agent/tools.js";

describe("categorizeExpense", () => {
  it.each([
    ["Uber receipt", undefined, "transport"],
    ["Zomato order", undefined, "food"],
    ["BigBasket grocery", undefined, "groceries"],
    ["Netflix renewal", undefined, "entertainment"],
    ["Apollo pharmacy", undefined, "health"],
    ["Airtel postpaid", undefined, "bills"],
    ["Amazon shipment", undefined, "shopping"],
    ["unknown thing", undefined, "other"],
  ])("categorizes %s → %s", (rawText, merchant, expected) => {
    expect(categorizeExpense({ merchant, rawText })).toBe(expected);
  });
});

describe("processReceiptImage", () => {
  it("logs an expense from receipt fields", async () => {
    const { db, state } = makeFakeDb();
    const out = await processReceiptImage({
      image: Buffer.from("img"),
      mimetype: "image/jpeg",
      analyzer: fakeImageAnalyzer,
      db: db as any,
      now: new Date(),
    });
    expect(out.amount).toBe(250);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].amount).toBe(25000); // cents
  });

  it("rejects when amount missing", async () => {
    const { db } = makeFakeDb();
    const noAmount = { async extractReceipt() { return { rawText: "blank" }; } };
    await expect(
      processReceiptImage({
        image: Buffer.from("x"),
        mimetype: "image/jpeg",
        analyzer: noAmount,
        db: db as any,
        now: new Date(),
      }),
    ).rejects.toThrow(/extract amount/);
  });
});

describe("log_expense_text tool", () => {
  it("parses 'spent 200 on coffee' and inserts", async () => {
    const r = new ToolRegistry();
    registerReceiptExpense(r);
    const deps = makeAgentDeps();
    const tool = r.get("log_expense_text")!;
    const out: any = await tool.handler(
      { text: "spent 200 on coffee at Starbucks" },
      { userPhone: "+9100", now: new Date(), timezone: "UTC", deps },
    );
    expect(out.amountCents).toBe(20000);
    expect(out.merchant).toBe("Starbucks");
  });

  it("rejects when amount can't be parsed", async () => {
    const r = new ToolRegistry();
    registerReceiptExpense(r);
    const deps = makeAgentDeps();
    const tool = r.get("log_expense_text")!;
    await expect(
      tool.handler(
        { text: "yo" },
        { userPhone: "+9100", now: new Date(), timezone: "UTC", deps },
      ),
    ).rejects.toThrow();
  });
});
