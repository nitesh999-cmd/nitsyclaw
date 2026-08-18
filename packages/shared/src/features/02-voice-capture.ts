// Feature 2: Voice capture → transcribe → file.

import { z } from "zod";
import { updateMessageTranscript } from "../db/repo.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { Transcriber } from "../agent/deps.js";
import { encryptForStorage } from "../utils/crypto.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { TranscriptionRequestOptions, TranscriptionResult } from "../voice/types.js";
import { coerceTranscriptionResult } from "../voice/policy.js";

export async function transcribeAndStore(args: {
  audio: Buffer;
  mimetype: string;
  transcriber: Transcriber;
  db: import("../db/client.js").DB;
  ownerHash: string;
  sourceMessageId?: string;
  options?: TranscriptionRequestOptions;
}): Promise<{ transcript: string; transcription: TranscriptionResult }> {
  if (args.audio.byteLength === 0) throw new Error("empty audio");
  const transcription = coerceTranscriptionResult(
    await args.transcriber.transcribe(args.audio, args.mimetype, args.options) as unknown,
    { mimetype: args.mimetype, bytes: args.audio.byteLength },
  );
  const transcript = transcription.text;
  if (!transcript.trim()) throw new Error("transcription empty");
  if (args.sourceMessageId) {
    await updateMessageTranscript(args.db, args.sourceMessageId, encryptForStorage(transcript));
  }
  // A transcript is conversation history, not automatically a durable fact.
  // Long-term memory remains an explicit tool action so ASR mistakes cannot
  // silently become profile truth.
  return { transcript, transcription };
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
        content: encryptForStorage(input.transcript),
        tags: input.tags ?? ["voice"],
      });
      return { memoryId: mem.id };
    },
  });
}
