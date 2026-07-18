import { and, desc, eq, gt, sql } from "drizzle-orm";
import { auditLog, confirmations, getDb, memories } from "@nitsyclaw/shared/db";
import {
  localBrainModeFromEnv,
  looksLikeStoredPromptInjection,
  OllamaProvider,
  retrieveMemoriesWithLocalEmbeddings,
  type RetrievedLocalMemory,
  type OllamaHealth,
} from "@nitsyclaw/shared/local-brain";
import { getOwnerIdentity } from "../../lib/dashboard-runtime";
import { assertPublicSaleTenantBoundaries } from "@nitsyclaw/shared/tenancy";
import {
  isLocalBrainBrowserProofEnabled,
  loadBrowserProofLocalBrain,
  type BrowserProofData,
} from "./browser-proof-fixture";

export const dynamic = "force-dynamic";

interface LocalBrainData {
  health: OllamaHealth;
  approvals: Array<{ id: string; action: string }>;
  route: { output?: unknown; durationMs?: number | null } | null;
  retrieved: RetrievedLocalMemory[];
  retrievalNote: string;
  excludedCount: number;
  browserProof?: BrowserProofData["browserProof"];
}

async function loadLocalBrain(provider: OllamaProvider, health: OllamaHealth): Promise<LocalBrainData> {
  assertPublicSaleTenantBoundaries();
  const { ownerHash } = getOwnerIdentity();
  const db = getDb();
  const [memoryRows, approvalRows, routeRows] = await Promise.all([
    db.select().from(memories).where(eq(memories.ownerHash, ownerHash)).orderBy(desc(memories.createdAt)).limit(20),
    db.select().from(confirmations).where(and(
      eq(confirmations.ownerHash, ownerHash),
      eq(confirmations.status, "pending"),
      gt(confirmations.expiresAt, new Date()),
    )).orderBy(desc(confirmations.createdAt)).limit(5),
    db.select().from(auditLog).where(and(
      eq(auditLog.tool, "model_route"),
      sql`${auditLog.input}->>'ownerHash' = ${ownerHash}`,
    )).orderBy(desc(auditLog.createdAt)).limit(1),
  ]);
  let retrieved: RetrievedLocalMemory[] = [];
  let retrievalNote = "Install and configure a local embedding model to retrieve memory semantically.";
  if (health.embeddingModel) {
    try {
      retrieved = await retrieveMemoriesWithLocalEmbeddings({
        ownerHash,
        query: "today priorities commitments follow ups active projects",
        candidates: memoryRows,
        embedder: provider.asEmbedder(),
        limit: 5,
      });
      retrievalNote = retrieved.length ? "Ranked locally for today's priorities." : "No eligible relevant memories found.";
    } catch {
      retrievalNote = "Local memory retrieval was unavailable; no cloud embedding fallback was used.";
    }
  }
  const excludedCount = memoryRows.filter((row) => looksLikeStoredPromptInjection(row.content)).length;
  return { health, approvals: approvalRows, route: routeRows[0] ?? null, retrieved, retrievalNote, excludedCount };
}

function emptyData(reason: string, health?: OllamaHealth): LocalBrainData {
  return {
    health: health ?? {
      state: "offline",
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      models: [],
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      reason,
    },
    approvals: [],
    route: null,
    retrieved: [],
    retrievalNote: "Private dashboard data is unavailable.",
    excludedCount: 0,
  };
}

function textField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

export default async function LocalBrainPage() {
  let data: LocalBrainData;
  const provider = new OllamaProvider();
  const health = await provider.health();
  try {
    data = isLocalBrainBrowserProofEnabled()
      ? await loadBrowserProofLocalBrain(provider, health)
      : await loadLocalBrain(provider, health);
  } catch (error) {
    data = emptyData(error instanceof Error ? error.message : "Local Brain data could not be loaded.", health);
  }
  const route = textField(data.route?.output, "route") ?? "No route recorded yet";
  const reason = textField(data.route?.output, "reasonCode") ?? "Send a request to record a routing decision";
  const stateTone = data.health.state === "online"
    ? "border-emerald-800 bg-emerald-950/30 text-emerald-200"
    : data.health.state === "degraded"
      ? "border-amber-800 bg-amber-950/30 text-amber-200"
      : "border-red-900 bg-red-950/30 text-red-200";

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <div className="nc-eyebrow">Private reasoning, visible control</div>
            <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">Local Brain</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">
              Everyday personal context stays on the local Ollama path. Cloud reasoning is a deliberate route, never a hidden default for private data.
            </p>
          </div>
          <div className={`rounded-2xl border p-4 ${stateTone}`} role="status">
            <div className="text-xs font-semibold uppercase tracking-[0.16em]">Ollama {data.health.state}</div>
            <div className="mt-2 text-lg font-semibold">{data.health.chatModel ?? "No chat model selected"}</div>
            <div className="mt-1 text-xs opacity-80">Checked in {data.health.latencyMs} ms</div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Local brain status">
        {[
          ["Privacy mode", localBrainModeFromEnv().replaceAll("_", " ")],
          ["Last route", route],
          ["Reason", reason.replaceAll("_", " ")],
          ["Models detected", String(data.health.models.length)],
        ].map(([label, value]) => (
          <div key={label} className="nc-tile">
            <div className="nc-eyebrow">{label}</div>
            <div className="mt-3 text-base font-semibold capitalize text-slate-100">{value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="nc-section" data-testid="local-brain-memories">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="nc-eyebrow">Retrieved memories</div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-100">Context used with provenance</h2>
            </div>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">Local embeddings</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{data.retrievalNote}</p>
          <div className="mt-4 grid gap-2">
            {data.retrieved.length ? data.retrieved.map((memory) => (
              <article key={memory.id} className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-sm leading-6 text-slate-200">{memory.content.slice(0, 220)}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  <span>{memory.confidence} confidence</span><span>score {memory.score.toFixed(3)}</span><span>{memory.source}</span><span>{new Date(memory.timestamp).toLocaleDateString()}</span>
                </div>
              </article>
            )) : <div className="nc-empty">No retrieved memories to show. Nothing is fabricated to fill this panel.</div>}
          </div>
          {data.excludedCount > 0 ? <p className="mt-3 text-xs text-amber-300">{data.excludedCount} instruction-like memory row(s) were excluded from retrieval.</p> : null}
        </div>

        <div className="grid gap-4">
          <section className="nc-section">
            <div className="nc-eyebrow">Why this model?</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-100">{reason.replaceAll("_", " ")}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              The router considers request type, sensitivity, complexity, model availability, and explicit cloud approval. It records only safe labels and timing, not your prompt.
            </p>
            {data.route ? <p className="mt-3 text-xs text-slate-500">Last route latency: {data.route.durationMs ?? 0} ms</p> : null}
          </section>

          <section className="nc-section" data-testid="local-brain-approvals">
            <div className="nc-eyebrow">Proposed actions</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-100">{data.approvals.length} waiting for review</h2>
            <div className="mt-3 grid gap-2">
              {data.approvals.slice(0, 3).map((approval) => (
                <div key={approval.id} className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-3 text-sm text-amber-100">
                  {approval.action.replaceAll("_", " ")}
                </div>
              ))}
              {!data.approvals.length ? <p className="text-sm text-slate-400">No risky actions are waiting.</p> : null}
            </div>
            <a href="/confirmations" className="nc-button mt-4">Open Review</a>
          </section>
        </div>
      </section>

      {data.browserProof ? (
        <section className="nc-section" data-testid="local-brain-browser-proof">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="nc-eyebrow">Synthetic browser proof</div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-100">Disposable fixture, local-only route</h2>
            </div>
            <span data-testid="browser-proof-fixture-name" className="rounded-full border border-emerald-800 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-200">
              {data.browserProof.fixtureName}
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            This panel renders only under the fail-closed browser-proof fixture. It uses synthetic owner data, no real database URL, and localhost Ollama only.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
              <div className="nc-eyebrow">Today focus</div>
              <div data-testid="browser-proof-today-focus" className="mt-2 text-sm font-semibold text-slate-100">{data.browserProof.todayFocusTitle}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
              <div className="nc-eyebrow">Preference recall</div>
              <div data-testid="browser-proof-preference" className="mt-2 text-sm font-semibold text-slate-100">{data.browserProof.activePreference}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
              <div className="nc-eyebrow">Risky action</div>
              <div data-testid="browser-proof-risky-action" className="mt-2 text-sm font-semibold text-slate-100">
                {data.browserProof.riskyActionStatus}; action calls {data.browserProof.actionCalls}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
              <div className="nc-eyebrow">Model route</div>
              <div data-testid="browser-proof-local-route" className="mt-2 text-sm font-semibold text-slate-100">
                {data.browserProof.route} / {data.browserProof.mode} / {data.browserProof.localResponseCharacters} chars
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {Object.entries(data.browserProof.checks).map(([key, passed]) => (
              <div key={key} data-testid={`browser-proof-check-${key}`} className={passed ? "rounded-xl border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100" : "rounded-xl border border-red-900/60 bg-red-950/20 px-3 py-2 text-sm text-red-100"}>
                {passed ? "PASS" : "FAIL"} - {key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`)}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.health.reason ? <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">{data.health.reason}</div> : null}
    </div>
  );
}
