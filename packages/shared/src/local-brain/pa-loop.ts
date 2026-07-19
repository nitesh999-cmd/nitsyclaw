import { classifyPaRequest } from "./router.js";
import type { PaRequestClass } from "./types.js";

export type PaLoopStage = "capture" | "understand" | "retrieve" | "propose" | "approve" | "act" | "remember";

export interface PaCapturedRequest {
  text: string;
  receivedAt: string;
  source: "whatsapp" | "dashboard" | "local";
  ownerHash: string;
}

export interface PaRetrievedContext {
  id: string;
  source: string;
  text: string;
  timestamp?: string;
  confidence?: number;
  instructionLike?: boolean;
}

export interface PaProposal {
  summary: string;
  actions: Array<{
    id: string;
    label: string;
    external: boolean;
    destructive: boolean;
    reversible: boolean;
  }>;
}

export interface PaLoopResult {
  requestClass: PaRequestClass;
  stages: Array<{ stage: PaLoopStage; status: "completed" | "waiting" | "skipped"; detail: string }>;
  retrieved: PaRetrievedContext[];
  proposal: PaProposal;
  approvalRequired: boolean;
  acted: boolean;
  remembered: boolean;
  status: "completed" | "awaiting_approval" | "refused";
}

export interface PaLoopHandlers {
  retrieve: (request: PaCapturedRequest) => Promise<PaRetrievedContext[]>;
  propose: (request: PaCapturedRequest, context: PaRetrievedContext[], requestClass: PaRequestClass) => Promise<PaProposal>;
  act?: (proposal: PaProposal) => Promise<void>;
  remember?: (request: PaCapturedRequest, proposal: PaProposal) => Promise<void>;
}

export async function runPaLoop(args: {
  request: PaCapturedRequest;
  handlers: PaLoopHandlers;
  approved?: boolean;
  rememberDurably?: boolean;
}): Promise<PaLoopResult> {
  const request = { ...args.request, text: normalizeCapturedText(args.request.text) };
  const requestClass = classifyPaRequest(request.text);
  const requestApprovalRequired = requestClass === "external_action_requires_approval" || requestClass === "destructive_sensitive_requires_confirmation";
  const stages: PaLoopResult["stages"] = [
    { stage: "capture", status: "completed", detail: "Request captured with owner and source." },
    { stage: "understand", status: "completed", detail: `Classified as ${requestClass}.` },
  ];

  const retrieved = (await args.handlers.retrieve(request))
    .filter((item) => !item.instructionLike)
    .map((item) => ({ ...item, text: wrapUntrustedContext(item.text) }));
  stages.push({
    stage: "retrieve",
    status: "completed",
    detail: `${retrieved.length} trusted-context candidate(s) retrieved; instruction-like content excluded.`,
  });
  const proposal = await args.handlers.propose(request, retrieved, requestClass);
  stages.push({ stage: "propose", status: "completed", detail: `${proposal.actions.length} action(s) proposed.` });
  const proposalApprovalRequired = proposal.actions.some((action) => action.external || action.destructive);
  const approvalRequired = requestApprovalRequired || proposalApprovalRequired;
  const destructiveProposed = proposal.actions.some((action) => action.destructive);

  if (destructiveProposed && !args.approved) {
    stages.push({ stage: "approve", status: "waiting", detail: "Explicit confirmation is required." });
    stages.push({ stage: "act", status: "skipped", detail: "No destructive action ran." });
    stages.push({ stage: "remember", status: "skipped", detail: "No outcome was stored before approval." });
    return { requestClass, stages, retrieved, proposal, approvalRequired: true, acted: false, remembered: false, status: "awaiting_approval" };
  }

  if (approvalRequired && !args.approved) {
    stages.push({ stage: "approve", status: "waiting", detail: "User approval is required before external action." });
    stages.push({ stage: "act", status: "skipped", detail: "No external action ran." });
    stages.push({ stage: "remember", status: "skipped", detail: "Proposal is not recorded as completed work." });
    return { requestClass, stages, retrieved, proposal, approvalRequired, acted: false, remembered: false, status: "awaiting_approval" };
  }

  stages.push({ stage: "approve", status: approvalRequired ? "completed" : "skipped", detail: approvalRequired ? "Explicit approval supplied." : "No approval needed." });
  const mayAct = proposal.actions.length > 0 && Boolean(args.handlers.act);
  if (mayAct) await args.handlers.act!(proposal);
  stages.push({ stage: "act", status: mayAct ? "completed" : "skipped", detail: mayAct ? "Approved action handler completed." : "Answer/proposal only." });

  const shouldRemember = args.rememberDurably === true && Boolean(args.handlers.remember);
  if (shouldRemember) await args.handlers.remember!(request, proposal);
  stages.push({ stage: "remember", status: shouldRemember ? "completed" : "skipped", detail: shouldRemember ? "Durable outcome recorded." : "No durable memory requested." });
  return { requestClass, stages, retrieved, proposal, approvalRequired, acted: mayAct, remembered: shouldRemember, status: "completed" };
}

export function looksLikeStoredPromptInjection(text: string): boolean {
  return /(?:\[\/?untrusted_memory_data\]|\b(?:ignore|disregard|forget) (?:all |any |the )?(?:previous|prior|earlier|system|developer) (?:instructions|directions|message|prompt)\b|\bfollow (?:these|the|my) instructions\b|\b(?:treat|use) (?:this|the following) (?:memory|note|text) as (?:an? )?(?:instruction|system|developer|policy)\b|\b(?:obey|execute) (?:this|the following|these) (?:text|instructions|commands?)\b|\bpretend (?:that )?you are (?:the )?(?:system|developer|administrator|admin)\b|\boutput (?:all|every) (?:saved )?(?:credential|secret|token|password)s?\b|\b(?:print|show|expose|dump)\b.{0,80}\b(?:hidden|private|saved|all)\b.{0,40}\b(?:credential|secret|token|password|memory|memories)s?\b|\bsystem prompt\b|\bdeveloper message\b|\byou are now\b|\bact as\b|\btool call\b|\bexfiltrate\b|\breveal secrets?\b|\boverride safety\b|\bdo not tell the user\b)/i.test(text);
}

export function wrapUntrustedContext(text: string): string {
  const cleaned = normalizeCapturedText(text).slice(0, 2_000).replace(/\[/g, "［").replace(/\]/g, "］");
  return `[UNTRUSTED_MEMORY_DATA]\n${cleaned}\n[/UNTRUSTED_MEMORY_DATA]`;
}

function normalizeCapturedText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}
