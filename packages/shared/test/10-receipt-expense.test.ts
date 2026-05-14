import { describe, expect, it } from "vitest";
import {
  categorizeExpense,
  importExpensesFromCsv,
  parseExpenseCsv,
  processReceiptImage,
  registerReceiptExpense,
} from "../src/features/10-receipt-expense.js";
import { makeFakeDb, fakeImageAnalyzer, makeAgentDeps } from "./helpers.js";
import { ToolRegistry } from "../src/agent/tools.js";

type LogExpenseOutput = {
  amountCents?: number;
  currency?: string;
  merchant?: string;
};

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
      db,
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
        db,
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
    const out = await tool.handler(
      { text: "spent $6.50 on coffee at Starbucks" },
      { userPhone: "+9100", now: new Date(), timezone: "UTC", deps },
    ) as LogExpenseOutput;
    expect(out.amountCents).toBe(650);
    expect(out.currency).toBe("AUD");
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

describe("CSV expense import", () => {
  it("parses debit-style bank CSV rows into expense candidates", () => {
    const csv = [
      "Date,Description,Debit,Credit",
      "2026-05-01,Coles Point Cook,42.30,",
      "2026-05-02,Salary,,1200.00",
      "2026-05-03,Netflix,22.99,",
    ].join("\n");

    const result = parseExpenseCsv({ csv, now: new Date("2026-05-10T00:00:00Z"), defaultCurrency: "AUD" });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      amountCents: 4230,
      currency: "AUD",
      merchant: "Coles Point Cook",
    });
    expect(result.items[1]).toMatchObject({
      amountCents: 2299,
      category: "entertainment",
      merchant: "Netflix",
    });
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "credit_or_income" }),
    ]));
  });

  it("imports CSV expenses without needing a bank connection", async () => {
    const { db, state } = makeFakeDb();
    const csv = [
      "Transaction Date,Details,Amount",
      "09/05/2026,Uber Trip,-18.75",
      "10/05/2026,Chemist Warehouse,-31.20",
    ].join("\n");

    const result = await importExpensesFromCsv({
      csv,
      db,
      now: new Date("2026-05-10T00:00:00Z"),
      defaultCurrency: "AUD",
    });

    expect(result.importedCount).toBe(2);
    expect(result.totalAmountCents).toBe(4995);
    expect(result.currency).toBe("AUD");
    expect(state.expenses).toHaveLength(2);
    expect(state.expenses[0]).toMatchObject({
      amount: 1875,
      currency: "AUD",
      category: "transport",
      merchant: "Uber Trip",
    });
  });
});
