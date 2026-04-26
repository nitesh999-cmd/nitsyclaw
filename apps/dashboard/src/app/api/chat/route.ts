import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

const SYSTEM_PROMPT = `You are NitsyClaw, Nitesh's personal assistant.
Reply concisely and helpfully. Plain text, no markdown.
If the user asks about their reminders, expenses, calendar, or memory â€” note that those
features are accessed via WhatsApp commands today; suggest sending the same message via
WhatsApp for full functionality. The dashboard chat is for conversation only in v1.`;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: "Server is missing ANTHROPIC_API_KEY in .env.local" }, { status: 500 });
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ reply: "Bad request" }, { status: 400 });
  }
  if (!body.history?.length) {
    return NextResponse.json({ reply: "No messages provided" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  try {
    const resp = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: body.history.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    return NextResponse.json({ reply: text || "(empty reply)" });
  } catch (e) {
    return NextResponse.json({
      reply: "LLM error: " + (e instanceof Error ? e.message : String(e)),
    }, { status: 500 });
  }
}