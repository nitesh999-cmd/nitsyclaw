import { describe, expect, it } from "vitest";
import {
  analyzeLifeAdminIntake,
  extractDocumentTextFromMedia,
  registerAllFeatures,
} from "../src/features/index.js";

describe("life admin intake", () => {
  function makeSimplePdf(textLines: string[]): Buffer {
    const textOps = textLines
      .map((line, index) => `${index === 0 ? "" : "0 -24 Td\n"}(${line.replace(/[()\\]/g, "\\$&")}) Tj`)
      .join("\n");
    const stream = `BT\n/F1 18 Tf\n72 720 Td\n${textOps}\nET`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
    pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, "utf8");
  }

  it("extracts a utility bill and recommends bill comparison plus reminder", () => {
    const result = analyzeLifeAdminIntake({
      text: "AGL Energy electricity bill. Account 123456789012. Amount due $248.60. Due date 17 May 2026. Usage 620 kWh.",
      now: new Date("2026-05-05T09:00:00+10:00"),
    });

    expect(result.kind).toBe("bill");
    expect(result.title).toBe("Energy bill");
    expect(result.keyFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Amount due", value: "AUD 248.60" }),
        expect.objectContaining({ label: "Due date", value: "2026-05-17" }),
        expect.objectContaining({ label: "Provider", value: "AGL Energy" }),
        expect.objectContaining({ label: "Account/reference", value: "********9012" }),
      ]),
    );
    expect(result.suggestedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "compare_bill", priority: "high" }),
        expect.objectContaining({ kind: "reminder", priority: "high" }),
      ]),
    );
  });

  it("extracts contract review risks without pretending to give legal advice", () => {
    const result = analyzeLifeAdminIntake({
      text: "Service Agreement between Nitesh Basudkar and Example Pty Ltd. Term starts 1 June 2026. Termination requires 30 days notice. Early exit fee $399. Sign by 20 May 2026.",
      now: new Date("2026-05-05T09:00:00+10:00"),
    });

    expect(result.kind).toBe("contract");
    expect(result.title).toBe("Contract or agreement");
    expect(result.keyFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Amount mentioned", value: "AUD 399.00" }),
        expect.objectContaining({ label: "Deadline", value: "2026-05-20" }),
      ]),
    );
    expect(result.suggestedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "review_contract", priority: "high" }),
        expect.objectContaining({ kind: "reminder", priority: "medium" }),
      ]),
    );
    expect(result.warnings.join(" ")).toMatch(/not legal advice/i);
  });

  it("turns a public social video URL into an analysis request action", () => {
    const result = analyzeLifeAdminIntake({
      text: "Can you analyse this reel and tell me the hook? https://www.instagram.com/reel/ABC123/",
      now: new Date("2026-05-05T09:00:00+10:00"),
    });

    expect(result.kind).toBe("social_video");
    expect(result.keyFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "URL", value: "https://www.instagram.com/reel/ABC123/" }),
      ]),
    );
    expect(result.suggestedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "analyze_social_video", priority: "medium" }),
      ]),
    );
  });

  it("does not leak raw emails, phone numbers, or long account numbers in the safe preview", () => {
    const result = analyzeLifeAdminIntake({
      text: "Email me at nitesh@example.com or call +61 430 008 008. Account 9876543210987654. <script>alert(1)</script>",
      now: new Date("2026-05-05T09:00:00+10:00"),
    });

    expect(result.safePreview).not.toContain("nitesh@example.com");
    expect(result.safePreview).not.toContain("+61 430 008 008");
    expect(result.safePreview).not.toContain("9876543210987654");
    expect(result.safePreview).not.toContain("<script>");
    expect(result.safePreview).toContain("[email]");
    expect(result.safePreview).toContain("[phone]");
    expect(result.safePreview).toContain("********7654");
  });

  it("registers the intake analysis tool", () => {
    const registry = registerAllFeatures({ surface: "whatsapp" });

    expect(registry.get("analyze_life_admin_intake")).toBeTruthy();
  });

  it("extracts safe text from text-like uploaded documents", async () => {
    const extracted = await extractDocumentTextFromMedia({
      data: Buffer.from("AGL Energy electricity bill\nAmount due $248.60\nDue date 17 May 2026"),
      mimetype: "text/plain",
      filename: "bill.txt",
    });

    expect(extracted.supported).toBe(true);
    expect(extracted.text).toContain("AGL Energy electricity bill");
    expect(extracted.truncated).toBe(false);

    const result = analyzeLifeAdminIntake({
      text: extracted.text,
      mediaType: "document",
      filename: "bill.txt",
      mimetype: "text/plain",
      now: new Date("2026-05-05T09:00:00+10:00"),
    });
    expect(result.kind).toBe("bill");
    expect(result.keyFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Amount due", value: "AUD 248.60" }),
        expect.objectContaining({ label: "Due date", value: "2026-05-17" }),
      ]),
    );
  });

  it("extracts selectable text from PDFs and feeds it into bill analysis", async () => {
    const extracted = await extractDocumentTextFromMedia({
      data: makeSimplePdf([
        "AGL Energy electricity bill",
        "Amount due $248.60",
        "Due date 17 May 2026",
      ]),
      mimetype: "application/pdf",
      filename: "bill.pdf",
    });

    expect(extracted.supported).toBe(true);
    expect(extracted.text).toContain("AGL Energy electricity bill");

    const result = analyzeLifeAdminIntake({
      text: extracted.text,
      mediaType: "document",
      filename: "bill.pdf",
      mimetype: "application/pdf",
      now: new Date("2026-05-05T09:00:00+10:00"),
    });
    expect(result.kind).toBe("bill");
    expect(result.keyFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Amount due", value: "AUD 248.60" }),
        expect.objectContaining({ label: "Due date", value: "2026-05-17" }),
      ]),
    );
  });
});
