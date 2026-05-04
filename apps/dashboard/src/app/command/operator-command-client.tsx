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

  async function queueMission(action: "queue_mission" | "queue_all" | "queue_next_50", missionId?: string) {
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
      <div className="flex flex-wrap gap-2">
        {modes.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setMode(item.value)}
            className={
              "border px-3 py-2 text-sm " +
              (mode === item.value
                ? "border-neutral-100 bg-neutral-100 text-neutral-950"
                : "border-neutral-800 text-neutral-300 hover:border-neutral-600")
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
          className="min-h-32 resize-y border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none focus:border-neutral-500"
        />
        <div className="space-y-3">
          <button
            type="button"
            onClick={runCommand}
            disabled={busy || !prepared.trim()}
            className="h-12 w-full bg-neutral-100 px-4 text-sm font-medium text-neutral-950 disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {busy ? "Running" : "Run Command"}
          </button>
          <div className="border border-neutral-800 p-3 text-xs text-neutral-400">
            <div className="mb-2 text-neutral-500">Prepared</div>
            <div className="break-words text-neutral-200">{prepared || "No command"}</div>
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
            className="border border-neutral-800 px-3 py-3 text-left text-sm text-neutral-200 hover:border-neutral-600"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <section className="space-y-3 border border-neutral-800 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase text-neutral-500">Top 20 operator missions</div>
            <div className="mt-1 text-sm text-neutral-300">
              Queue the whole build program as durable dashboard jobs.
            </div>
          </div>
          <button
            type="button"
            onClick={() => queueMission("queue_all")}
            disabled={Boolean(missionBusy)}
            className="border border-neutral-200 px-4 py-2 text-sm text-neutral-100 disabled:border-neutral-800 disabled:text-neutral-600"
          >
            {missionBusy === "queue_all" ? "Queuing" : "Queue All 20"}
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {OPERATOR_MISSIONS.map((mission) => (
            <button
              key={mission.id}
              type="button"
              onClick={() => queueMission("queue_mission", mission.id)}
              disabled={Boolean(missionBusy)}
              className="border border-neutral-800 p-3 text-left hover:border-neutral-600 disabled:border-neutral-900 disabled:text-neutral-600"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-neutral-100">{mission.title}</div>
                <div className="text-xs text-neutral-500">{mission.severity}</div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                {mission.category} / {mission.size}
              </div>
              <div className="mt-2 text-xs text-neutral-400">{mission.outcome}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 border border-neutral-800 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase text-neutral-500">Next 50 product moves</div>
            <div className="mt-1 text-sm text-neutral-300">
              Queue the expanded roadmap for personal use, trust, automation, integrations, SaaS, and launch readiness.
            </div>
          </div>
          <button
            type="button"
            onClick={() => queueMission("queue_next_50")}
            disabled={Boolean(missionBusy)}
            className="border border-neutral-200 px-4 py-2 text-sm text-neutral-100 disabled:border-neutral-800 disabled:text-neutral-600"
          >
            {missionBusy === "queue_next_50" ? "Queuing" : "Queue Next 50"}
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {OPERATOR_NEXT_50.slice(0, 10).map((item) => (
            <div key={item.id} className="border border-neutral-900 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-neutral-100">{item.title}</div>
                <div className="text-xs text-neutral-500">{item.severity}</div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                {item.category} / {item.size}
              </div>
              <div className="mt-2 text-xs text-neutral-400">{item.why}</div>
            </div>
          ))}
        </div>
      </section>

      {lastCommand ? (
        <div className="border border-neutral-800 p-4 text-sm">
          <div className="text-xs uppercase text-neutral-500">Last command</div>
          <div className="mt-2 whitespace-pre-wrap text-neutral-300">{lastCommand}</div>
        </div>
      ) : null}

      {reply ? (
        <div className="border border-emerald-900/60 bg-emerald-950/20 p-4 text-sm text-emerald-100">
          <div className="text-xs uppercase text-emerald-500">Result</div>
          <div className="mt-2 whitespace-pre-wrap">{reply}</div>
        </div>
      ) : null}

      {missionReply ? (
        <div className="border border-sky-900/60 bg-sky-950/20 p-4 text-sm text-sky-100">
          <div className="text-xs uppercase text-sky-500">Mission queue</div>
          <div className="mt-2 whitespace-pre-wrap">{missionReply}</div>
        </div>
      ) : null}

      {error ? (
        <div className="border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-100">
          <div className="text-xs uppercase text-red-500">Failed</div>
          <div className="mt-2">{error}</div>
        </div>
      ) : null}
    </section>
  );
}
