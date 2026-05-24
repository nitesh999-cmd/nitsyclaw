// Feature 2: Voice capture → transcribe → file.

import { z } from "zod";
import { insertMemory, updateMessageTranscript } from "../db/repo.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { Transcriber } from "../agent/deps.js";
import { encryptForStorage } from "../utils/crypto.js";
import { privateOwnerTenant, privateOwnerTenantForPhone } from "../tenancy.js";

export async function transcribeAndStore(args: {
  audio: Buffer;
  mimetype: string;
  transcriber: Transcriber;
  db: import("../db/client.js").DB;
  sourceMessageId?: string;
}): Promise<{ transcript: string; memoryId: string }> {
  if (args.audio.byteLength === 0) throw new Error("empty audio");
  const transcript = await args.transcriber.transcribe(args.audio, args.mimetype);
  if (!transcript.trim()) throw new Error("transcription empty");
  if (args.sourceMessageId) {
    await updateMessageTranscript(args.db, args.sourceMessageId, encryptForStorage(transcript));
  }
  const mem = await insertMemory(args.db, privateOwnerTenant(), {
    kind: "note",
    content: transcript,
    tags: ["voice"],
    sourceMessageId: args.sourceMessageId,
  });
  return { transcript, memoryId: mem.id };
}

export function registerVoiceCapture(registry: ToolRegistry): void {
  registry.register({
    name: "save_voice_note",
    description:
      "Save the transcript of a voice note as a memory. Call after the bot has already received and transcribed an inbound voice message.",
    inputSchema: z.object({
      transcript: z.string().min(1),
      tags: z.array(z.string()).optional(),
    }),
    handler: async (input: { transcript: string; tags?: string[] }, ctx: ToolContext) => {
      const { insertMemory } = await import("../db/repo.js");
      const mem = await insertMemory(ctx.deps.db, privateOwnerTenantForPhone(ctx.userPhone), {
        kind: "note",
        content: input.transcript,
        tags: input.tags ?? ["voice"],
      });
      return { memoryId: mem.id };
    },
  });
}
