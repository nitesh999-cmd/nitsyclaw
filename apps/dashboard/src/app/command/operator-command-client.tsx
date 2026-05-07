"use client";

import { useMemo, useState } from "react";
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

function commandFor(mode: Mode, text: string): string {
  const clean = text.trim();
  if (mode === "feature") {
    return /^\/addfeature\b/i.test(clean) ? clean : `/addfeature ${clean}`;
  }
  if (mode === "bug") {
    return /^bug\b/i.test(clean) ? clean : `bug: ${clean}`;
  }
  if (mode === "location") {
    return /^(?:i['’]?m|i am)\s+in\b/i.test(clean) || /^use\s+.+\s+for\s+weather/i.test(clean)
      ? clean
      : `I'm in ${clean}`;
  }
  if (mode === "build") {
    return clean || "run build agent";
  }
  return clean;
}

export function OperatorCommandClient() {
  const [mode, setMode] = useState<Mode>("ask");
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");
  const [missionReply, setMissionReply] = useState("");
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
        throw new Error(body.reply ?? `Request failed with HTTP ${res.status}`);
      }
      const tools = body.meta?.tools?.length
        ? `\n\nTools: ${body.meta.tools.map((tool) => `${tool.name ?? "tool"}=${tool.success ? "ok" : "failed"}`).join(", ")}`
        : "";
      setReply(`${body.reply ?? "(empty reply)"}${tools}`);
      if (mode === "feature" || mode === "bug") setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Command failed");
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
        throw new Error(body.reply ?? `Request failed with HTTP ${res.status}`);
      }
      setMissionReply(body.reply ?? `Queued ${body.queued ?? 0}; existing ${body.existing ?? 0}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operator mission failed");
    } finally {
      setMissionBusy("");
    }
  }

  return (
    <section className="space-y-4" data-testid="operator-command">
      <section className="nc-section">
        <div className="nc-eyebrow">What this page does</div>
        <div className="mt-2 text-sm leading-6 text-stone-700">
          This is the planning desk. It can send a command to the assistant or add work into Requests.
          Queuing does not build, run code, or deploy by itself. It only saves the work so the operator runner or Codex can pick it up later.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="text-sm font-semibold text-stone-950">Run Command</div>
            <div className="mt-1 text-xs leading-5 text-stone-600">Sends one instruction to the dashboard assistant.</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="text-sm font-semibold text-stone-950">Queue Top 20</div>
            <div className="mt-1 text-xs leading-5 text-stone-600">Adds the main operator missions to Requests.</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="text-sm font-semibold text-stone-950">Queue Next 50</div>
            <div className="mt-1 text-xs leading-5 text-stone-600">Adds roadmap ideas to Requests. It is not automatic execution.</div>
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
                ? "border-[#b85c38] bg-[#b85c38] text-white"
                : "border-stone-300 bg-white text-stone-700 hover:border-[#b85c38] hover:text-[#8e3f24]")
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
          className="min-h-32 resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950 outline-none placeholder:text-stone-500 focus:border-[#b85c38] focus:ring-4 focus:ring-[#f2d1c3]"
        />
        <div className="space-y-3">
          <button
            type="button"
            onClick={runCommand}
            disabled={busy || !prepared.trim()}
            className="h-12 w-full rounded-xl bg-[#b85c38] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#8e3f24] disabled:bg-stone-200 disabled:text-stone-500"
          >
            {busy ? "Running" : "Run Command"}
          </button>
          <div className="rounded-xl border border-stone-200 bg-[#fffdf8] p-3 text-xs text-stone-600">
            <div className="mb-2 font-semibold uppercase text-stone-500">Prepared</div>
            <div className="break-words text-stone-900">{prepared || "No command"}</div>
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
            className="rounded-xl border border-stone-200 bg-white px-3 py-3 text-left text-sm font-semibold text-stone-800 transition-colors hover:border-[#b85c38] hover:text-[#8e3f24]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <section className="space-y-3 rounded-2xl border border-stone-200 bg-[#fffdf8] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-[#8e3f24]">Top 20 operator missions</div>
            <div className="mt-1 text-sm text-stone-700">
              Queue the whole build program as durable dashboard jobs.
            </div>
          </div>
          <button
            type="button"
            onClick={() => queueMission("queue_all")}
            disabled={Boolean(missionBusy)}
            className="rounded-xl border border-[#b85c38] bg-[#b85c38] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#8e3f24] disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-500"
          >
            {missionBusy === "queue_all" ? "Queuing" : "Queue Top 20 requests"}
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {OPERATOR_MISSIONS.map((mission) => (
            <button
              key={mission.id}
              type="button"
              onClick={() => queueMission("queue_mission", mission.id)}
              disabled={Boolean(missionBusy)}
              className="rounded-xl border border-stone-200 bg-white p-3 text-left transition-colors hover:border-[#b85c38] disabled:border-stone-200 disabled:bg-stone-50 disabled:text-stone-500"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-stone-950">{mission.title}</div>
                <div className="text-xs font-semibold text-[#8e3f24]">{mission.severity}</div>
              </div>
              <div className="mt-2 text-xs text-stone-600">
                {mission.category} / {mission.size}
              </div>
              <div className="mt-2 text-xs leading-5 text-stone-700">{mission.outcome}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-stone-200 bg-[#fffdf8] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-[#8e3f24]">Next 50 product moves</div>
            <div className="mt-1 text-sm text-stone-700">
              Queue the expanded roadmap for personal use, trust, automation, integrations, SaaS, and launch readiness.
            </div>
          </div>
          <button
            type="button"
            onClick={() => queueMission("queue_next_50")}
            disabled={Boolean(missionBusy)}
            className="rounded-xl border border-[#b85c38] bg-[#b85c38] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#8e3f24] disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-500"
          >
            {missionBusy === "queue_next_50" ? "Queuing" : "Queue Next 50 requests"}
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {OPERATOR_NEXT_50.slice(0, 10).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => queueMission("queue_next_50_item", item.id)}
              disabled={Boolean(missionBusy)}
              className="rounded-xl border border-stone-200 bg-white p-3 text-left transition-colors hover:border-[#b85c38] disabled:border-stone-200 disabled:bg-stone-50 disabled:text-stone-500"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-stone-950">{item.title}</div>
                <div className="text-xs font-semibold text-[#8e3f24]">{item.severity}</div>
              </div>
              <div className="mt-2 text-xs text-stone-600">
                {item.category} / {item.size}
              </div>
              <div className="mt-2 text-xs leading-5 text-stone-700">{item.why}</div>
              <div className="mt-3 text-xs font-semibold text-[#8e3f24]">
                {missionBusy === item.id ? "Queuing" : "Queue this move"}
              </div>
            </button>
          ))}
        </div>
      </section>

      {lastCommand ? (
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <div className="text-xs font-semibold uppercase text-stone-500">Last command</div>
          <div className="mt-2 whitespace-pre-wrap text-stone-800">{lastCommand}</div>
        </div>
      ) : null}

      {reply ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
          <div className="text-xs font-semibold uppercase text-emerald-700">Result</div>
          <div className="mt-2 whitespace-pre-wrap">{reply}</div>
        </div>
      ) : null}

      {missionReply ? (
        <div className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-950">
          <div className="text-xs font-semibold uppercase text-sky-700">Mission queue</div>
          <div className="mt-2 whitespace-pre-wrap">{missionReply}</div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">
          <div className="text-xs font-semibold uppercase text-red-700">Failed</div>
          <div className="mt-2">{error}</div>
        </div>
      ) : null}
    </section>
  );
}
