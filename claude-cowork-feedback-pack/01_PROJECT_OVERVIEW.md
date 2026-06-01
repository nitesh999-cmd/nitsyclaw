# Project Overview

## Project name

NitsyClaw

## One-line description

A WhatsApp-first personal life-admin assistant with a private dashboard control plane.

## Plain-English explanation

NitsyClaw lets the owner send normal WhatsApp messages or voice notes to an AI assistant. The assistant can answer questions, save reminders, log AUD expenses, summarise bills and receipts, draft replies, keep memory, check risky messages, and show what is working or still pending.

The dashboard exists as the control surface: today view, chat, reminders, expenses, confirmations, memory, privacy, settings, health, queue, release, recovery, and owner tools.

## Target user

Current reality:

- One private owner, Nitesh.

Intended V1 target:

- Busy non-technical people who already live in WhatsApp and want help with bills, receipts, expenses, reminders, admin tasks, and safer drafting.

## Main problem solved

The product tries to remove small daily admin from the user's head by turning messy WhatsApp messages into useful actions, summaries, drafts, and reminders.

## Core workflow

1. User sends WhatsApp text, voice, image, document, or command.
2. Bot stores the command and routes deterministic shortcuts first.
3. Safe local actions can run: reminders, expenses, bill summaries, drafts, memory, search, proof checks.
4. Risky actions require confirmation.
5. External providers are reported as setup-needed or blocked unless actually connected.
6. Dashboard shows private-owner control, status, review, data, and setup surfaces.

## Current project status

Private-owner validation build.

Evidence:

- `pnpm run customer:check` says `can_use_for_personal=yes`.
- `pnpm run customer:check` says `can_sell_publicly=no`.
- Recent CI run for commit `ad8ea31` passed Windows, test, e2e, security, ZAP baseline, Vercel packaging check, and WhatsApp production smoke.

## What appears finished

- WhatsApp private-owner routing.
- Reminder creation and listing.
- Text expenses in AUD by default.
- Receipt/document/bill summarisation rails.
- Drafting and message safety checks.
- Feature queue/status responses.
- Provider readiness reporting.
- Confirmation gates for risky actions.
- Release/CI/security smoke scripts.
- Dashboard validation-demo shell.

## What appears unfinished

- Public multi-tenant sale.
- Real Gmail/Outlook mailbox actions.
- Real Drive/OneDrive/Photos browsing.
- Real phone/SMS sending or calling.
- Live bank feeds.
- Facebook birthdays/social data.
- Full provider setup wizard with normal-user OAuth flow.
- Commercial-grade voice reliability beyond current browser/WhatsApp voice flows.
- Billing, support, onboarding, and customer account separation.

## Biggest uncertainty

Whether normal users will pay for the reliable daily-admin wedge before the bigger integrations are live. The product is stronger as "WhatsApp life-admin command centre" than as "AI can do everything".

