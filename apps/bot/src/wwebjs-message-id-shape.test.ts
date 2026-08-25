import { describe, expect, it } from "vitest";

import { describeMessageIdShape } from "./wwebjs-client.js";

describe("describeMessageIdShape", () => {
  it("reports the pre-rename shape whatsapp-web.js expects", () => {
    const shape = describeMessageIdShape({
      fromMe: true,
      remote: "x",
      id: "ABC",
      _serialized: "true_1234567890@c.us_ABC",
    });

    expect(shape).toContain("_serialized=string(");
    expect(shape).toContain("$1=undefined");
  });

  it("reports the renamed shape described upstream in wwebjs#201833", () => {
    // If WhatsApp's 2026-07 web update renamed the getter, this is what arrives:
    // _serialized is gone and $1 carries the value, so downloadMedia() receives
    // undefined as the message id.
    const shape = describeMessageIdShape({
      fromMe: true,
      remote: "x",
      id: "ABC",
      $1: "true_1234567890@c.us_ABC",
    });

    expect(shape).toContain("_serialized=undefined");
    expect(shape).toContain("$1=string(");
  });

  it("never emits the id value, which contains the phone number", () => {
    const serialized = "true_61400000000@c.us_ABCDEF";
    const shape = describeMessageIdShape({ _serialized: serialized });

    expect(shape).not.toContain(serialized);
    expect(shape).not.toContain("61400000000");
    expect(shape).not.toContain("@c.us");
  });

  it("degrades safely on absent or non-object ids", () => {
    expect(describeMessageIdShape(undefined)).toBe("id=absent");
    expect(describeMessageIdShape(null)).toBe("id=absent");
    expect(describeMessageIdShape("ABC")).toBe("id=non-object(string)");
  });
});
