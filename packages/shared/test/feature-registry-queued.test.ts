import { describe, expect, it } from "vitest";
import { registerAllFeatures } from "../src/features/index.js";

describe("queued feature registry", () => {
  it("registers newly implemented queued tools", () => {
    const names = registerAllFeatures({ surface: "whatsapp" }).all().map((tool) => tool.name);
    expect(names).toContain("search_conversation_history");
    expect(names).toContain("add_cant_do_item");
    expect(names).toContain("list_cant_do_items");
    expect(names).toContain("add_birthday_template");
    expect(names).toContain("list_birthday_templates");
    expect(names).toContain("search_gmail_inbox");
    expect(names).toContain("spotify_top_tracks");
    expect(names).toContain("spotify_search_tracks");
    expect(names).toContain("queue_spotify_playlist_creation");
    expect(names).toContain("list_integration_capabilities");
    expect(names).toContain("queue_email_draft_creation");

    expect(names).not.toContain("send_email");
    expect(names).not.toContain("drive_search");
    expect(names).not.toContain("send_sms");
    expect(names).not.toContain("bank_feed_sync");
    expect(names).not.toContain("google_photos_search");
    expect(names).not.toContain("facebook_birthdays");
    expect(names).not.toContain("analyze_social_video");
  });
});
