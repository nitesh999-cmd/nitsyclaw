import { describe, expect, it } from "vitest";
import { applyVerifiedSources, createVerifiedSourceCollector } from "../src/search/verified-sources.js";

const A = { title: "Reuters: World", url: "https://reuters.example.com/world" };
const B = { title: "ABC News — AU", url: "https://abc.example.net/au" };
const C = { title: "Guardian | Live", url: "https://guardian.example.org/live" };

describe("createVerifiedSourceCollector", () => {
  it("starts empty and reports nothing recorded", () => {
    const collector = createVerifiedSourceCollector();

    expect(collector.hasAny()).toBe(false);
    expect(collector.list()).toEqual([]);
  });

  it("keeps pairs in call order across several research calls", () => {
    const collector = createVerifiedSourceCollector();

    collector.record([A]);
    collector.record([B, C]);

    expect(collector.list()).toEqual([A, B, C]);
    expect(collector.hasAny()).toBe(true);
  });

  it("deduplicates by URL and keeps the first title seen", () => {
    const collector = createVerifiedSourceCollector();

    collector.record([A, B]);
    collector.record([{ title: "A vaguer later label", url: A.url }, C]);

    expect(collector.list()).toEqual([A, B, C]);
  });

  it("ignores entries with no URL, so a half-formed pair cannot be displayed", () => {
    const collector = createVerifiedSourceCollector();

    collector.record([{ title: "No link", url: "" }, A]);

    expect(collector.list()).toEqual([A]);
  });

  it("accepts seeded pairs from a router pre-search", () => {
    const collector = createVerifiedSourceCollector([A]);

    collector.record([A, B]);

    expect(collector.list()).toEqual([A, B]);
  });

  it("keeps turns isolated — two collectors never share state", () => {
    const first = createVerifiedSourceCollector();
    const second = createVerifiedSourceCollector();

    first.record([A]);

    expect(second.hasAny()).toBe(false);
    expect(second.list()).toEqual([]);
  });
});

describe("applyVerifiedSources", () => {
  it("returns the text byte-identical when nothing was verified", () => {
    const text = "Docs are at https://example.com/guide — have a look.";

    expect(applyVerifiedSources(text, [])).toBe(text);
  });

  it("strips model-written links and appends only verified pairs", () => {
    const delivered = applyVerifiedSources(
      "1. Talks resumed — ABC News (https://reuters.example.com/world)\n2. Markets rose — Reuters https://abc.example.net/au",
      [A, B],
    );

    const lines = delivered.split("\n");
    const start = lines.indexOf("Sources:") + 1;
    expect(lines.slice(start)).toEqual([
      "1. Reuters: World",
      "https://reuters.example.com/world",
      "2. ABC News — AU",
      "https://abc.example.net/au",
    ]);
    // The crossed inline links are gone; only the verified pairs remain.
    expect(lines.slice(0, start - 1).join("\n")).not.toMatch(/https?:\/\//);
    expect(delivered.match(/https:\/\//g)).toHaveLength(2);
  });

  it("preserves the prose around a removed link", () => {
    const delivered = applyVerifiedSources("Talks resumed https://x.example.com/1 this morning.", [A]);

    expect(delivered).toContain("Talks resumed this morning.");
  });
});
