"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OPERATOR_MISSIONS } from "./operator-missions";
import { OPERATOR_NEXT_50 } from "./operator-roadmap";

type Mode = "ask" | "feature" | "bug" | "location" | "build";

interface CommandPreset {
  label: string;
  mode: Mode;
  text: string;
}

const presets: CommandPreset[] = [
  {
    label: "Desktop Gateway",
    mode: "feature",
    text: "Build a local desktop gateway that lets NitsyClaw safely control browser, files, and selected apps from approved commands.",
  },
  {
    label: "Codex Factory",
    mode: "feature",
    text: "Build a Codex-backed feature factory: WhatsApp or dashboard feature request creates a build task, runs tests, opens/pushes changes, and reports deployment status.",
  },
  {
    label: "Skill Store",
    mode: "feature",
    text: "Build a skill registry with installable modules for Spotify, birthdays, bills, photos, files, inbox, calendar, and desktop automation.",
  },
  {
    label: "Self-Healing",
    mode: "feature",
    text: "Build self-healing operations that detect WhatsApp silence, stuck agent loops, failed deploys, stale heartbeats, and failed tool calls, then recover or create a P0 bug.",
  },
  {
    label: "War Room",
    mode: "ask",
    text: "Give me the brutal operator view: what is broken, what is blocked, what should be built next, and what needs approval?",
  },
  {
    label: "Queue Push",
    mode: "build",
    text: "run build agent",
  },
];

const modes: Array<{ value: Mode; label: string }> = [
  { value: "ask", label: "Ask" },
  { value: "feature", label: "Feature" },
  { value: "bug", label: "Bug" },
  { value: "location", label: "Location" },
  { value: "build", label: "Build" },
];

const COMMAND_FAILED = "Command failed. Try again shortly.";
const MISSION_FAILED = "Operator mission failed. Try again shortly.";

function commandFor(mode: Mode, text: string): string {
  const clean = text.trim();
  if (mode === "feature") {
    return /^\/addfeature\b/i.test(clean) ? clean : `/addfeature ${clean}`;
  }
  if (mode === "bug") {
    return /^bug\b/i.test(clean) ? clean : `bug: ${clean}`;
  }
  if (mode === "location") {
    return /^(?:i(?:['\u2019])?m|i am)\s+in\b/i.test(clean) || /^use\s+.+\s+for\s+weather/i.test(clean)
      ? clean
      : `I'm in ${clean}`;
  }
  if (mode === "build") {
    return clean || "run build agent";
  }
  return clean;
}

export function OperatorCommandClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ask");
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");
  const [missionReply, setMissionReply] = useState("");
  const [missionSummary, setMissionSummary] = useState("");
  const [lastCommand, setLastCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [missionBusy, setMissionBusy] = useState("");
  const [error, setError] = useState("");

  const prepared = useMemo(() => commandFor(mode, input), [mode, input]);

  async function runCommand() {
    const command = prepared.trim();
    if (!command || busy) return;

    setBusy(true);
    setError("");
    setReply("");
    setLastCommand(command);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: [{ role: "user", content: command }] }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        reply?: string;
        meta?: { tools?: Array<{ name?: string; success?: boolean }> };
      };
      if (!res.ok) {
        setError(body.reply ?? COMMAND_FAILED);
        return;
      }
      const tools = body.meta?.tools?.length
        ? `\n\nTools: ${body.meta.tools.map((tool) => `${tool.name ?? "tool"}=${tool.success ? "ok" : "failed"}`).join(", ")}`
        : "";
      setReply(`${body.reply ?? "(empty reply)"}${tools}`);
      if (mode === "feature" || mode === "bug") setInput("");
    } catch {
      setError(COMMAND_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function queueMission(
    action: "queue_mission" | "queue_all" | "queue_next_50" | "queue_next_50_item",
    missionId?: string,
  ) {
    if (missionBusy) return;

    setMissionBusy(missionId ?? action);
    setError("");
    setMissionReply("");
    setMissionSummary("");

    try {
      const res = await fetch("/api/operator/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, missionId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        reply?: string;
        queued?: number;
        existing?: number;
      };
      if (!res.ok) {
        setError(body.reply ?? MISSION_FAILED);
        return;
      }
      setMissionReply(body.reply ?? `Queued ${body.queued ?? 0}; existing ${body.existing ?? 0}.`);
      setMissionSummary(`Saved ${body.queued ?? 0} new request${body.queued === 1 ? "" : "s"}; ${body.existing ?? 0} already existed. Open Requests to see them, or run the laptop operator when you want execution.`);
      router.refresh();
    } catch {
      setError(MISSION_FAILED);
    } finally {
      setMissionBusy("");
    }
  }

  return (
    <section className="space-y-4" data-testid="operator-command">
      <section className="nc-section">
        <div className="nc-eyebrow">What happens here</div>
        <div className="mt-2 text-sm leading-6 text-slate-400">
          This page is a safe holding area. It can ask the assistant one thing, or save future work into Requests.
          Saved requests wait for the laptop runner; nothing here auto-builds, texts anyone, or deploys by itself.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="nc-tile">
            <div className="text-sm font-semibold text-slate-100">Run one command</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">Runs one safe dashboard/chat action now.</div>
          </div>
          <div className="nc-tile">
            <div className="text-sm font-semibold text-slate-100">Save build work</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">Saves only. Does not run code, send messages, or deploy.</div>
          </div>
          <div className="nc-tile">
            <div className="text-sm font-semibold text-slate-100">Save future ideas</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">Adds roadmap ideas to Requests so they can be reviewed later.</div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {modes.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setMode(item.value)}
            className={
              "rounded-full border px-3 py-2 text-sm font-semibold transition-colors " +
              (mode === item.value
                ? "border-[#d8b75d] bg-[#d8b75d]/10 text-[#d8b75d]"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:border-[#d8b75d] hover:text-[#d8b75d]")
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type the command..."
          className="min-h-32 resize-y rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#d8b75d] focus:ring-4 focus:ring-[#d8b75d]/20"
        />
        <div className="space-y-3">
          <button
            type="button"
            onClick={runCommand}
            disabled={busy || !prepared.trim()}
            className="h-12 w-full rounded-xl bg-[#d8b75d] px-4 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-[#e8c76d] disabled:bg-slate-700 disabled:text-slate-500"
          >
            {busy ? "Running" : "Run one command"}
          </button>
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-xs text-slate-500">
            <div className="mb-2 font-semibold uppercase text-slate-500">Will send</div>
            <div className="break-words text-slate-200">{prepared || "No command"}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              setMode(preset.mode);
              setInput(preset.text);
            }}
            className="nc-tile text-left text-sm font-semibold text-slate-200 transition-colors hover:border-[#d8b75d] hover:text-[#d8b75d]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {missionSummary ? (
        <div className="rounded-xl border border-sky-800 bg-sky-950/30 p-4 text-sm text-sky-100" role="status">
          <div className="text-xs font-semibold uppercase text-sky-300">Saved to Requests</div>
          <div className="mt-2 leading-6">{missionSummary}</div>
          <a href="/queue?status=pending" className="mt-3 inline-flex text-sm font-semibold text-[#d8b75d] hover:text-[#e8c76d]">
            Open Requests
          </a>
        </div>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="nc-eyebrow">Top 20 build missions</div>
            <div className="mt-1 text-sm text-slate-400">
              Save the whole build program as durable dashboard jobs.
            </div>
          </div>
          <button
            type="button"
            onClick={() => queueMission("queue_all")}
            disabled={Boolean(missionBusy)}
            className="rounded-xl border border-[#d8b75d] bg-[#d8b75d]/10 px-4 py-2 text-sm font-semibold text-[#d8b75d] transition-colors hover:bg-[#d8b75d]/20 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
          >
            {missionBusy === "queue_all" ? "Saving" : "Save Top 20 only"}
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {OPERATOR_MISSIONS.map((mission) => (
            <button
              key={mission.id}
              type="button"
              onClick={() => queueMission("queue_mission", mission.id)}
              disabled={Boolean(missionBusy)}
              className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 text-left transition-colors hover:border-[#d8b75d] disabled:border-slate-800 disabled:bg-slate-900/10 disabled:text-slate-600"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-slate-100">{mission.title}</div>
                <div className="text-xs font-semibold text-[#d8b75d]">{mission.severity}</div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {mission.category} / {mission.size}
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-400">{mission.outcome}</div>
              <div className="mt-3 text-xs font-semibold text-[#d8b75d]">
                {missionBusy === mission.id ? "Saving" : "Save only"}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="nc-eyebrow">Next 50 product moves</div>
            <div className="mt-1 text-sm text-slate-400">
              Queue the expanded roadmap for personal use, trust, automation, integrations, SaaS, and launch readiness.
            </div>
          </div>
          <button
            type="button"
            onClick={() => queueMission("queue_next_50")}
            disabled={Boolean(missionBusy)}
            className="rounded-xl border border-[#d8b75d] bg-[#d8b75d]/10 px-4 py-2 text-sm font-semibold text-[#d8b75d] transition-colors hover:bg-[#d8b75d]/20 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
          >
            {missionBusy === "queue_next_50" ? "Saving" : "Save Next 50 only"}
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {OPERATOR_NEXT_50.slice(0, 10).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => queueMission("queue_next_50_item", item.id)}
              disabled={Boolean(missionBusy)}
              className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 text-left transition-colors hover:border-[#d8b75d] disabled:border-slate-800 disabled:bg-slate-900/10 disabled:text-slate-600"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                <div className="text-xs font-semibold text-[#d8b75d]">{item.severity}</div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {item.category} / {item.size}
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-400">{item.why}</div>
              <div className="mt-3 text-xs font-semibold text-[#d8b75d]">
                {missionBusy === item.id ? "Saving" : "Save only"}
              </div>
            </button>
          ))}
        </div>
      </section>

      {lastCommand ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-sm">
          <div className="text-xs font-semibold uppercase text-slate-500">Last command</div>
          <div className="mt-2 whitespace-pre-wrap text-slate-300">{lastCommand}</div>
        </div>
      ) : null}

      {reply ? (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-200">
          <div className="text-xs font-semibold uppercase text-emerald-400">Result</div>
          <div className="mt-2 whitespace-pre-wrap">{reply}</div>
        </div>
      ) : null}

      {missionReply ? (
        <div className="rounded-xl border border-sky-900 bg-sky-950/30 p-4 text-sm text-sky-200">
          <div className="text-xs font-semibold uppercase text-sky-400">Mission queue</div>
          <div className="mt-2 whitespace-pre-wrap">{missionReply}</div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-200">
          <div className="text-xs font-semibold uppercase text-red-400">Failed</div>
          <div className="mt-2">{error}</div>
        </div>
      ) : null}
    </section>
  );
}
