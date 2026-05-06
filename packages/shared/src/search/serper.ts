// Serper.dev web search adapter.
// Sign up at https://serper.dev — 2 500 free queries/month on the free tier.
// Set SERPER_API_KEY in .env.local to enable.

import type { WebSearcher } from "../agent/deps.js";

interface SerperOrganic {
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerperApiResponse {
  organic?: SerperOrganic[];
}

export function makeSerperSearch(apiKey: string): WebSearcher {
  return {
    async search(query: string) {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 5 }),
      });
      if (!res.ok) {
        throw new Error(`Serper search failed: HTTP ${res.status}`);
      }
      const data = (await res.json()) as SerperApiResponse;
      return (data.organic ?? []).slice(0, 5).map((r) => ({
        title: r.title ?? "(no title)",
        url: r.link ?? "",
        snippet: r.snippet ?? "",
      }));
    },
  };
}

export const noopWebSearch: WebSearcher = {
  async search() {
    return [];
  },
};
