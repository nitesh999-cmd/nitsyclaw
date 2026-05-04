export type MissionSize = "S" | "M" | "L";
export type MissionSeverity = "P0" | "P1" | "P2" | "P3";

export interface OperatorMission {
  id: string;
  title: string;
  category: string;
  severity: MissionSeverity;
  size: MissionSize;
  description: string;
  outcome: string;
}

export const OPERATOR_MISSIONS: OperatorMission[] = [
  {
    id: "self-healing-core",
    title: "Self-Healing Core",
    category: "Reliability",
    severity: "P0",
    size: "L",
    description:
      "Build a self-healing operator loop that detects WhatsApp silence, stale heartbeats, stuck queues, failed tool calls, and failed deploy checks, then records a P0 incident and suggests or runs the safest recovery path.",
    outcome: "Bugs become visible fast and recovery stops depending on memory.",
  },
  {
    id: "whatsapp-control-plane",
    title: "WhatsApp Control Plane",
    category: "WhatsApp",
    severity: "P0",
    size: "L",
    description:
      "Build a WhatsApp-safe command control plane with loop protection, quiet hours, presence safety, retry limits, manual resume, and dashboard-visible bot state.",
    outcome: "WhatsApp becomes reliable enough for daily personal use.",
  },
  {
    id: "operator-job-runner",
    title: "Operator Job Runner",
    category: "Automation",
    severity: "P1",
    size: "L",
    description:
      "Build a durable job runner that can pick queued build tasks, mark state transitions, run verification commands, capture logs, and report results back to dashboard and WhatsApp.",
    outcome: "Feature requests move from queue to executed work with traceability.",
  },
  {
    id: "personal-context-engine",
    title: "Personal Context Engine",
    category: "Memory",
    severity: "P1",
    size: "M",
    description:
      "Build structured personal context for current location, home location, timezone, preferences, recurring facts, and travel state, with expiry and source labels.",
    outcome: "Weather, reminders, and recommendations follow the user instead of guessing.",
  },
  {
    id: "privacy-command-center",
    title: "Privacy Command Center",
    category: "Trust",
    severity: "P1",
    size: "M",
    description:
      "Build dashboard controls for export, delete, retention, audit review, connected accounts, and sensitive-memory visibility using privacy-safe summaries.",
    outcome: "Consumer trust improves before selling this as a personal AI app.",
  },
  {
    id: "integration-request-router",
    title: "Integration Request Router",
    category: "Integrations",
    severity: "P1",
    size: "M",
    description:
      "Build a router that turns requests for Gmail, Outlook, Drive, OneDrive, Photos, Spotify, Facebook birthdays, SMS, and bank feeds into safe connection tasks with capability, risk, and setup status.",
    outcome: "Unsupported features become clear install/connect tasks instead of vague promises.",
  },
  {
    id: "daily-brief-v2",
    title: "Daily Brief V2",
    category: "Personal AI",
    severity: "P1",
    size: "M",
    description:
      "Build a morning brief that merges calendar, unread email, reminders, WhatsApp follow-ups, queue state, weather for current location, and top priorities into one short action brief.",
    outcome: "The assistant becomes useful every morning without prompting.",
  },
  {
    id: "universal-inbox",
    title: "Universal Inbox",
    category: "Personal AI",
    severity: "P2",
    size: "L",
    description:
      "Build a unified inbox view for WhatsApp, dashboard chat, email summaries, reminders, approvals, and feature requests with filters for urgent, waiting, and done.",
    outcome: "The user sees what needs attention in one place.",
  },
  {
    id: "approval-rail-v2",
    title: "Approval Rail V2",
    category: "Safety",
    severity: "P1",
    size: "M",
    description:
      "Upgrade confirmations into a full approval rail with risk labels, payload summaries, expiry, undo notes, and one-tap approve or reject from dashboard.",
    outcome: "Powerful actions stay safe and understandable.",
  },
  {
    id: "skill-registry",
    title: "Skill Registry",
    category: "Platform",
    severity: "P2",
    size: "L",
    description:
      "Build an installable skill registry for personal capabilities such as bills, music, photos, files, email, calendar, finance, travel, and desktop automation.",
    outcome: "NitsyClaw becomes modular instead of one hardcoded assistant.",
  },
  {
    id: "user-onboarding-v2",
    title: "Human Onboarding",
    category: "Product",
    severity: "P1",
    size: "M",
    description:
      "Build onboarding for non-AI users that explains what the assistant can do through simple choices, setup progress, safety expectations, and first useful tasks.",
    outcome: "Normal users can start without understanding AI tools.",
  },
  {
    id: "admin-observability",
    title: "Admin Observability",
    category: "Production",
    severity: "P1",
    size: "M",
    description:
      "Build operational observability for uptime, route failures, queue age, heartbeat freshness, auth lockouts, slow API calls, and deployment status.",
    outcome: "Production issues are visible before users complain.",
  },
  {
    id: "public-trust-layer",
    title: "Public Trust Layer",
    category: "Sales",
    severity: "P2",
    size: "M",
    description:
      "Build a public-facing trust layer with clear privacy claims, supported integrations, limitations, data controls, and safety model for early customers.",
    outcome: "The app is easier to sell without overclaiming.",
  },
  {
    id: "command-language",
    title: "Command Language",
    category: "UX",
    severity: "P2",
    size: "M",
    description:
      "Build a simple command language for add feature, bug, reminder, location, brief, search, approval, queue, and build commands across WhatsApp and dashboard.",
    outcome: "Users can control the assistant without learning menus.",
  },
  {
    id: "mobile-dashboard",
    title: "Mobile Dashboard",
    category: "UX",
    severity: "P1",
    size: "M",
    description:
      "Make the dashboard excellent on mobile for command entry, queue review, approvals, reminders, health, and chat without overlapping or oversized controls.",
    outcome: "The product works where personal AI will actually be used.",
  },
  {
    id: "agent-workbench",
    title: "Agent Workbench",
    category: "Automation",
    severity: "P2",
    size: "L",
    description:
      "Build an internal workbench for agent critiques, decision logs, implementation notes, verification results, and rejected options for each work item.",
    outcome: "Complex decisions become auditable instead of scattered in chat.",
  },
  {
    id: "integration-health-checks",
    title: "Integration Health Checks",
    category: "Integrations",
    severity: "P1",
    size: "M",
    description:
      "Build health checks for connected accounts including Spotify token freshness, email access, calendar access, storage access, and permission errors.",
    outcome: "Connected features fail loudly and explain what to reconnect.",
  },
  {
    id: "memory-quality-control",
    title: "Memory Quality Control",
    category: "Memory",
    severity: "P1",
    size: "M",
    description:
      "Build memory quality controls that separate facts, guesses, old snapshots, preferences, and temporary travel context, with review and expiry.",
    outcome: "The assistant stops confidently using stale or wrong personal data.",
  },
  {
    id: "customer-instance-model",
    title: "Customer Instance Model",
    category: "SaaS",
    severity: "P1",
    size: "L",
    description:
      "Design and implement the first customer-instance model for selling NitsyClaw: tenant isolation, owner identity, auth, data boundaries, and per-customer integrations.",
    outcome: "Personal use can evolve toward a paid app without unsafe shared state.",
  },
  {
    id: "release-war-room",
    title: "Release War Room",
    category: "Production",
    severity: "P1",
    size: "M",
    description:
      "Build a release war room that shows latest commit, deployment, live smoke status, test results, unresolved P0/P1 risks, and rollback notes.",
    outcome: "Shipping becomes controlled instead of guesswork.",
  },
];

export function getOperatorMission(id: string): OperatorMission | undefined {
  return OPERATOR_MISSIONS.find((mission) => mission.id === id);
}

export function missionToQueueDescription(mission: OperatorMission): string {
  return `[${mission.category}] ${mission.title}: ${mission.description} Outcome: ${mission.outcome}`;
}

