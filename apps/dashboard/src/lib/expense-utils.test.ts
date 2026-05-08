import { describe, expect, it } from "vitest";
import { csvCell, normalizeExpenseFilters, validateExpenseFilters } from "./expense-pure.js";
import { expenseWhere } from "./expense-utils.js";

describe("expense utils", () => {
  it("protects CSV cells from spreadsheet formula injection", () => {
    expect(csvCell("=SUM(1,1)")).toBe("\"'=SUM(1,1)\"");
    expect(csvCell(" =SUM(1,1)")).toBe("\"' =SUM(1,1)\"");
    expect(csvCell("\t=SUM(1,1)")).toBe("\"'\t=SUM(1,1)\"");
    expect(csvCell("\r\n=SUM(1,1)")).toBe("\"'\r\n=SUM(1,1)\"");
    expect(csvCell("\u0000=SUM(1,1)")).toBe("\"'\u0000=SUM(1,1)\"");
    expect(csvCell("\u001f=SUM(1,1)")).toBe("\"'\u001f=SUM(1,1)\"");
    expect(csvCell("merchant")).toBe("\"merchant\"");
  });

  it("normalizes repeated search params to first values", () => {
    expect(normalizeExpenseFilters({ q: ["coffee", "tea"], category: "food" })).toEqual({
      q: "coffee",
      category: "food",
      from: undefined,
      to: undefined,
    });
  });

  it("rejects invalid filter dates", () => {
    expect(validateExpenseFilters({ from: "bad-date" })).toBe("Invalid from date");
    expect(validateExpenseFilters({ from: "2026-02-31" })).toBe("Invalid from date");
    expect(validateExpenseFilters({ to: "2026-05-02" })).toBeNull();
  });

  it("builds no where clause for empty or invalid filters", () => {
    expect(expenseWhere({})).toBeUndefined();
    expect(expenseWhere({ from: "bad-date", to: "2026-02-31" })).toBeUndefined();
  });

  it("builds a where clause for searchable filters", () => {
    expect(expenseWhere({
      q: "coffee",
      category: "food",
      from: "2026-05-01",
      to: "2026-05-08",
    })).toBeDefined();
  });
});
