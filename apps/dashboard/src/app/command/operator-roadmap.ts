import type { MissionSeverity, MissionSize } from "./operator-missions";

export interface OperatorRoadmapItem {
  id: string;
  title: string;
  category: string;
  severity: MissionSeverity;
  size: MissionSize;
  description: string;
  why: string;
}

export const OPERATOR_NEXT_50: OperatorRoadmapItem[] = [
  {
    id: "first-day-wizard",
    title: "First-Day Wizard",
    category: "Personal AI",
    severity: "P1",
    size: "M",
    description:
      "Build a guided first-day flow that asks normal-human questions, captures home location, daily routine, important people, preferred channels, and first three jobs to automate.",
    why: "Personal AI only works when setup feels useful immediately, not technical.",
  },
  {
    id: "travel-aware-mode",
    title: "Travel-Aware Mode",
    category: "Personal AI",
    severity: "P1",
    size: "M",
    description:
      "Build temporary travel context with city, timezone, expiry, local weather, calendar timezone warnings, and automatic fallback to home context after the trip.",
    why: "It prevents wrong location answers when the user is away from home.",
  },
  {
    id: "people-memory",
    title: "People Memory",
    category: "Personal AI",
    severity: "P1",
    size: "M",
    description:
      "Build structured memory for important people, relationships, birthdays, preferred contact channel, last interaction, and pending follow-up notes.",
    why: "Personal assistants become valuable when they remember people, not just tasks.",
  },
  {
    id: "waiting-on-tracker",
    title: "Waiting-On Tracker",
    category: "Personal AI",
    severity: "P2",
    size: "M",
    description:
      "Build a tracker for things the user is waiting on from other people, with source message, due date, reminder cadence, and one-tap close.",
    why: "This turns loose conversations into follow-up leverage.",
  },
  {
    id: "cant-do-guard",
    title: "Can't-Do Guard",
    category: "Trust",
    severity: "P1",
    size: "M",
    description:
      "Build a visible capability boundary that lists what NitsyClaw cannot currently do, what needs connection, what is unsafe, and what can be queued instead.",
    why: "Clear limits create trust and stop the assistant from overpromising.",
  },
  {
    id: "data-map",
    title: "Data Inventory Map",
    category: "Trust",
    severity: "P1",
    size: "M",
    description:
      "Build a dashboard map of all data types stored, where each comes from, whether it is encrypted, how long it is kept, and how to delete or export it.",
    why: "This is essential for consumer trust before selling accounts to others.",
  },
  {
    id: "risk-labels",
    title: "Risk Labels",
    category: "Trust",
    severity: "P1",
    size: "S",
    description:
      "Add risk labels to actions such as sending messages, deleting data, connecting accounts, reading private files, and creating calendar events.",
    why: "Users need to understand the blast radius before approving actions.",
  },
  {
    id: "consent-receipts",
    title: "Consent Receipts",
    category: "Trust",
    severity: "P2",
    size: "M",
    description:
      "Build receipts for every permission grant, account connection, export, delete, and sensitive action, with timestamps and plain-English summaries.",
    why: "Consent history reduces confusion and supports safer paid usage.",
  },
  {
    id: "private-mode",
    title: "Private Mode",
    category: "Trust",
    severity: "P1",
    size: "M",
    description:
      "Build a private mode that prevents message persistence for selected dashboard or WhatsApp turns while still allowing an immediate answer.",
    why: "People need a way to ask sensitive things without growing permanent memory.",
  },
  {
    id: "memory-review-inbox",
    title: "Memory Review Inbox",
    category: "Memory",
    severity: "P1",
    size: "M",
    description:
      "Build a review queue for newly saved memories where the user can pin, edit, expire, downgrade, or delete facts before they become long-term context.",
    why: "Good memory requires user control, not automatic accumulation.",
  },
  {
    id: "stale-memory-detector",
    title: "Stale Memory Detector",
    category: "Memory",
    severity: "P1",
    size: "M",
    description:
      "Build detection for stale facts, old locations, past preferences, completed tasks, and outdated snapshots, then ask for review or auto-expire low-risk items.",
    why: "Wrong memory is worse than no memory because it creates confident mistakes.",
  },
  {
    id: "memory-source-links",
    title: "Memory Source Links",
    category: "Memory",
    severity: "P2",
    size: "M",
    description:
      "Show the source message or dashboard action behind each important memory so users can see why NitsyClaw believes something is true.",
    why: "Traceability makes personal AI explainable and correctable.",
  },
  {
    id: "priority-engine",
    title: "Priority Engine",
    category: "Automation",
    severity: "P1",
    size: "L",
    description:
      "Build a scoring engine that ranks reminders, approvals, follow-ups, bugs, queued features, and personal tasks by urgency, impact, risk, and age.",
    why: "A personal assistant must decide what matters first when everything competes.",
  },
  {
    id: "one-command-capture",
    title: "One-Command Capture",
    category: "Automation",
    severity: "P1",
    size: "M",
    description:
      "Build universal capture commands for idea, task, bug, expense, person, reminder, location, note, and feature across WhatsApp and dashboard.",
    why: "The fastest input path wins for non-technical users.",
  },
  {
    id: "agent-run-log",
    title: "Agent Run Log",
    category: "Automation",
    severity: "P1",
    size: "M",
    description:
      "Build a run log for every agent-style operation with input summary, decisions, files touched, commands run, errors, verification, and final result.",
    why: "This makes autonomous work inspectable instead of mysterious.",
  },
  {
    id: "job-retry-policy",
    title: "Job Retry Policy",
    category: "Automation",
    severity: "P1",
    size: "M",
    description:
      "Build retry and backoff rules for failed operator jobs, including max attempts, failure category, next retry time, and escalation to P0 or P1.",
    why: "Self-healing needs disciplined retries, not infinite loops.",
  },
  {
    id: "safe-command-parser",
    title: "Safe Command Parser",
    category: "Automation",
    severity: "P1",
    size: "M",
    description:
      "Build a command parser that extracts intent, target, date, channel, risk, and confirmation requirements before any action is executed.",
    why: "Parsing first keeps powerful commands predictable and testable.",
  },
  {
    id: "ops-slo-dashboard",
    title: "Ops SLO Dashboard",
    category: "Production",
    severity: "P1",
    size: "M",
    description:
      "Build service-level indicators for dashboard availability, bot freshness, queue age, API latency, failed tool rate, and live smoke status.",
    why: "Production quality requires visible health targets, not vibes.",
  },
  {
    id: "incident-timeline",
    title: "Incident Timeline",
    category: "Production",
    severity: "P1",
    size: "M",
    description:
      "Build an incident timeline for outages and broken flows with detection time, symptoms, affected surfaces, actions taken, and recovery proof.",
    why: "When things fail, tomorrow's fix needs a precise record.",
  },
  {
    id: "live-smoke-suite",
    title: "Live Smoke Suite",
    category: "Production",
    severity: "P1",
    size: "M",
    description:
      "Build a safe live smoke suite for production routes that checks auth redirects, security headers, destructive route denial, and key dashboard pages.",
    why: "Deploys need quick proof that the real app is safe and reachable.",
  },
  {
    id: "release-rollback-plan",
    title: "Release Rollback Plan",
    category: "Production",
    severity: "P1",
    size: "M",
    description:
      "Build dashboard-visible rollback notes that include previous deployment, current commit, migration status, known risk, and rollback command guidance.",
    why: "Fast rollback is part of shipping safely.",
  },
  {
    id: "observability-alerts",
    title: "Observability Alerts",
    category: "Production",
    severity: "P1",
    size: "M",
    description:
      "Add alerting for stale WhatsApp bot, high error rate, failed queue jobs, missing env configuration, auth lockouts, and failed production smoke checks.",
    why: "The system should wake the operator before users lose confidence.",
  },
  {
    id: "gmail-connector",
    title: "Gmail Connector",
    category: "Integrations",
    severity: "P1",
    size: "L",
    description:
      "Build a Gmail connection path for unread summaries, search, drafts, follow-up extraction, and permission status without sending mail automatically.",
    why: "Email is a core personal AI surface but must start read-safe.",
  },
  {
    id: "outlook-mail-connector",
    title: "Outlook Mail Connector",
    category: "Integrations",
    severity: "P1",
    size: "L",
    description:
      "Build Outlook mail read and draft support with account status, safe scopes, unread summaries, search, and manual approval before any send.",
    why: "Nitesh lives across Microsoft accounts, so Outlook cannot stay secondary.",
  },
  {
    id: "drive-connector",
    title: "Drive Connector",
    category: "Integrations",
    severity: "P1",
    size: "L",
    description:
      "Build Google Drive file search, recent files, document summaries, and explicit permission prompts for reading or sharing content.",
    why: "Personal AI gets much stronger when it can find the user's own files safely.",
  },
  {
    id: "onedrive-connector",
    title: "OneDrive Connector",
    category: "Integrations",
    severity: "P1",
    size: "L",
    description:
      "Build OneDrive file discovery, recent document summaries, and account health using Microsoft Graph with safe read-only defaults.",
    why: "Many real users live in Microsoft storage rather than Google Drive.",
  },
  {
    id: "photos-connector",
    title: "Photos Connector",
    category: "Integrations",
    severity: "P2",
    size: "L",
    description:
      "Build Google Photos import/search planning with albums, dates, people labels where available, and strict privacy warnings around image content.",
    why: "Photos are deeply personal and require stronger consent than ordinary files.",
  },
  {
    id: "spotify-assistant",
    title: "Spotify Assistant",
    category: "Integrations",
    severity: "P2",
    size: "M",
    description:
      "Expand Spotify from connection status into playlist suggestions, recently played context, liked-track search, and approved playlist creation.",
    why: "Music is a low-risk personal integration that makes the assistant feel alive.",
  },
  {
    id: "birthday-engine",
    title: "Birthday Engine",
    category: "Personal AI",
    severity: "P2",
    size: "M",
    description:
      "Build birthday tracking with message templates, relationship tone, timezone-aware reminders, and approval before any outbound message.",
    why: "Remembering people at the right time is a clear everyday win.",
  },
  {
    id: "sms-capability-plan",
    title: "SMS Capability Plan",
    category: "Integrations",
    severity: "P1",
    size: "M",
    description:
      "Design the SMS path with platform limits, provider choice, phone verification, compliance wording, rate limits, and approval before sending.",
    why: "SMS is powerful and risky, so it needs a plan before implementation.",
  },
  {
    id: "bank-feed-plan",
    title: "Bank Feed Plan",
    category: "Integrations",
    severity: "P1",
    size: "M",
    description:
      "Design bank-feed integration options with read-only scopes, provider evaluation, consent model, data minimisation, and expense categorisation boundaries.",
    why: "Finance data is high-trust and cannot be treated like a normal connector.",
  },
  {
    id: "receipt-autofiler",
    title: "Receipt Autofiler",
    category: "Personal AI",
    severity: "P2",
    size: "M",
    description:
      "Build receipt autofiling that extracts merchant, amount, category, date, warranty hints, and stores a clean expense record with image link.",
    why: "Receipts are a practical daily capture use case with measurable value.",
  },
  {
    id: "household-bills-mode",
    title: "Household Bills Mode",
    category: "Personal AI",
    severity: "P2",
    size: "L",
    description:
      "Build a household bills assistant for utilities, insurance, subscriptions, renewals, reminders, document capture, and next-best action prompts.",
    why: "This turns personal AI into money-saving household operations.",
  },
  {
    id: "quote-review-mode",
    title: "Quote Review Mode",
    category: "Product",
    severity: "P2",
    size: "M",
    description:
      "Build a mode for uploading quotes or proposals, extracting key terms, comparing risks, listing questions, and creating follow-up drafts.",
    why: "It extends the assistant into real-life decisions without pretending to be legal advice.",
  },
  {
    id: "voice-command-recovery",
    title: "Voice Command Recovery",
    category: "User Experience",
    severity: "P1",
    size: "M",
    description:
      "Build voice command recovery that shows transcript confidence, asks for correction, and never executes risky actions from uncertain audio.",
    why: "Voice is useful only if misheard commands do not cause damage.",
  },
  {
    id: "mobile-command-bar",
    title: "Mobile Command Bar",
    category: "User Experience",
    severity: "P1",
    size: "M",
    description:
      "Build a mobile-first command bar with quick actions for ask, add task, add feature, bug, location, reminder, queue, and approval.",
    why: "Most personal commands will happen on the phone, not desktop.",
  },
  {
    id: "offline-capture",
    title: "Offline Capture",
    category: "User Experience",
    severity: "P2",
    size: "M",
    description:
      "Build offline-safe capture on the dashboard so notes, tasks, bugs, and features can queue locally and sync when the network returns.",
    why: "The assistant should not lose thoughts because the connection drops.",
  },
  {
    id: "explain-my-data",
    title: "Explain My Data",
    category: "Trust",
    severity: "P2",
    size: "M",
    description:
      "Build an explainer view that answers what NitsyClaw knows about me, how it learned each thing, and how to correct or remove it.",
    why: "This makes the personal model transparent enough for ordinary users.",
  },
  {
    id: "tenant-boundaries",
    title: "Tenant Boundaries",
    category: "SaaS",
    severity: "P0",
    size: "L",
    description:
      "Design and implement tenant boundaries for future customers including owner identity, data partitioning, auth, secrets, and per-tenant connectors.",
    why: "Selling this without tenant isolation would be unsafe.",
  },
  {
    id: "billing-readiness",
    title: "Billing Readiness",
    category: "SaaS",
    severity: "P1",
    size: "M",
    description:
      "Design billing readiness with plans, usage limits, trial state, cancellation, invoices, and safe feature gating without collecting payments yet.",
    why: "Revenue work needs structure before Stripe or any public launch.",
  },
  {
    id: "customer-admin-panel",
    title: "Customer Admin Panel",
    category: "SaaS",
    severity: "P1",
    size: "L",
    description:
      "Build a future customer admin panel for account status, integrations, privacy controls, usage, support exports, and safe shutdown.",
    why: "Paid users need control surfaces, not only a chat box.",
  },
  {
    id: "support-diagnostics",
    title: "Support Diagnostics",
    category: "SaaS",
    severity: "P1",
    size: "M",
    description:
      "Build privacy-safe support diagnostics that show health and configuration without exposing message contents, secrets, or private files.",
    why: "Supportability matters before multiple people depend on the app.",
  },
  {
    id: "legal-copy-review",
    title: "Legal Copy Review",
    category: "SaaS",
    severity: "P1",
    size: "M",
    description:
      "Review and rewrite public copy to avoid misleading claims about autonomy, financial advice, medical advice, legal advice, or guaranteed outcomes.",
    why: "The product must be exciting without creating legal exposure.",
  },
  {
    id: "competitor-board",
    title: "Competitor Board",
    category: "Product",
    severity: "P2",
    size: "M",
    description:
      "Build an internal competitor board tracking OpenClaw-style workflows, WhatsApp assistants, personal AI apps, memory products, and automation tools.",
    why: "Strategy improves when comparison is systematic rather than anecdotal.",
  },
  {
    id: "magic-demo-script",
    title: "Magic Demo Script",
    category: "Product",
    severity: "P2",
    size: "M",
    description:
      "Build a demo script showing one normal person's day: morning brief, WhatsApp task, document lookup, birthday reminder, approval, and recovery.",
    why: "A sellable product needs a crisp story investors and users understand.",
  },
  {
    id: "value-dashboard",
    title: "Value Dashboard",
    category: "Product",
    severity: "P2",
    size: "M",
    description:
      "Build a dashboard showing time saved, tasks completed, reminders delivered, follow-ups closed, bugs prevented, and integrations connected.",
    why: "Users keep paying when they can see concrete value.",
  },
  {
    id: "habit-loop",
    title: "Habit Loop",
    category: "Product",
    severity: "P2",
    size: "M",
    description:
      "Build a habit loop with daily check-in, evening review, missed-task summary, and suggestions for tomorrow based on actual usage.",
    why: "Retention comes from repeated value, not one impressive demo.",
  },
  {
    id: "desktop-gateway-hardening",
    title: "Desktop Gateway Hardening",
    category: "Automation",
    severity: "P1",
    size: "L",
    description:
      "Design the desktop gateway with local allowlists, visible approvals, audit log, reversible commands, app-specific permissions, and emergency stop.",
    why: "Computer control is powerful enough to require serious safety before use.",
  },
  {
    id: "agent-challenge-protocol",
    title: "Agent Challenge Protocol",
    category: "Automation",
    severity: "P2",
    size: "M",
    description:
      "Build a decision protocol that records critique, counter-critique, accepted recommendation, rejected recommendation, and final implementation rationale.",
    why: "Multi-agent advice is useful only when decisions are captured and challenged.",
  },
  {
    id: "launch-readiness-score",
    title: "Launch Readiness Score",
    category: "Product",
    severity: "P1",
    size: "M",
    description:
      "Build a launch readiness score covering security, privacy, reliability, onboarding, observability, support, integrations, and legal-copy risk.",
    why: "A simple score keeps personal use and paid-app readiness separate.",
  },
];
