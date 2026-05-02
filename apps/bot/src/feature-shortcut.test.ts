import { describe, expect, it } from "vitest";
import { parseFeatureRequestShortcut } from "./feature-shortcut.js";

describe("parseFeatureRequestShortcut", () => {
  it("parses the slash addfeature command", () => {
    expect(parseFeatureRequestShortcut("/addfeature Add Google Photos search")?.description).toBe(
      "Add Google Photos search",
    );
  });

  it("parses natural feature request prefixes", () => {
    expect(parseFeatureRequestShortcut("feature request: add Spotify suggested playlist")?.description).toBe(
      "add Spotify suggested playlist",
    );
    expect(parseFeatureRequestShortcut("add feature birthday message templates")?.description).toBe(
      "birthday message templates",
    );
  });

  it("does not capture ordinary reminders or bug reports", () => {
    expect(parseFeatureRequestShortcut("remind me to call Sam tomorrow")).toBeNull();
    expect(parseFeatureRequestShortcut("fix whatsapp loop")).toBeNull();
  });
});
