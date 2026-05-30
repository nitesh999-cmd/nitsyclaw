import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type AgentRunLogStatus = "passed" | "failed" | "needs_review";

export interface AgentRunLogInput {
  operation: string;
  inputSummary: string;
  decisions?: string[];
  filesTouched?: string[];
  commandsRun?: string[];
  errors?: string[];
  verification?: string[];
  result?: string;
  jobId?: string;
  commit?: string;
  deployment?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface AgentRunLogEntry {
  schemaVersion: 1;
  status: AgentRunLogStatus;
  operation: string;
  jobId?: string;
  inputSummary: string;
  decisions: string[];
  filesTouched: string[];
  commandsRun: string[];
  errors: string[];
  verification: string[];
  result: string;
  commit?: string;
  deployment?: string;
  startedAt: string;
  completedAt: string;
}

export const DEFAULT_AGENT_RUN_LOG_PATH = ".nitsyclaw-local/agent-runs/agent-run-log.jsonl";

export function buildAgentRunLogEntry(input: AgentRunLogInput): AgentRunLogEntry {
  const startedAt = input.startedAt ?? new Date();
  const completedAt = input.completedAt ?? startedAt;
  const errors = cleanList(input.errors);
  const verification = cleanList(input.verification);

  return {
    schemaVersion: 1,
    status: errors.length > 0 ? "failed" : verification.length > 0 ? "passed" : "needs_review",
    operation: cleanText(input.operation) || "agent_operation",
    ...(input.jobId ? { jobId: redact(input.jobId) } : {}),
    inputSummary: cleanText(input.inputSummary) || "No input summary recorded.",
    decisions: cleanList(input.decisions),
    filesTouched: cleanList(input.filesTouched),
    commandsRun: cleanList(input.commandsRun),
    errors,
    verification,
    result: cleanText(input.result) || "No result recorded.",
    ...(input.commit ? { commit: redact(input.commit) } : {}),
    ...(input.deployment ? { deployment: redact(input.deployment) } : {}),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
  };
}

export async function appendAgentRunLog(
  input: AgentRunLogInput,
  path = DEFAULT_AGENT_RUN_LOG_PATH,
): Promise<AgentRunLogEntry> {
  const entry = buildAgentRunLogEntry(input);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

function cleanList(values: string[] | undefined): string[] {
  return (values ?? [])
    .map(cleanText)
    .filter((value): value is string => value.length > 0)
    .slice(0, 50);
}

function cleanText(value: string | undefined): string {
  if (!value) return "";
  const redacted = redact(value.replace(/\s+/g, " ").trim());
  return redacted.length > 500 ? `${redacted.slice(0, 500)}...[truncated]` : redacted;
}

export function redact(value: string): string {
  return value
    .replace(/\bpostgres(?:ql)?:\/\/\S+/gi, "[redacted:database-url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted:email]")
    .replace(/\b(?:(?:sk|pk)_(?:live|test)_[A-Za-z0-9._-]{8,}|(?:sk|pk|ghp|xox[baprs]?|ya29|eyJ)[A-Za-z0-9._-]{12,})\b/g, "[redacted:token]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, "[redacted:authorization]")
    .replace(/(?:\+?\d[\s().-]?){8,}\d/g, "[redacted:phone]");
}
