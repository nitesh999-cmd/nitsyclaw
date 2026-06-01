# Executive Brief

## What this is

NitsyClaw is a WhatsApp-first personal life-admin assistant with a private dashboard. It is designed to help a normal person speak or type messy admin into WhatsApp and get useful outcomes: reminders, expenses, bill summaries, drafts, memory, status checks, and safety warnings.

## Why it exists

The vision is to make a personal PA that does useful work from the user's natural chat flow instead of forcing them into AI tools, dashboards, or automation builders.

## Current state

This is a private-owner validation build, not a public product.

Evidence:

- `pnpm run customer:check` says personal use is allowed and public sale is blocked.
- `pnpm run tenant:check` says tenant-scoped storage is missing for key customer data tables.
- `pnpm run provider:health` says no external providers are ready/partial and bank feeds are blocked.
- Recent CI for commit `ad8ea31` passed, including WhatsApp production smoke.

## Biggest strength

The repo has a serious safety/reliability mindset: command jobs, confirmations, WhatsApp proof checks, release gates, provider readiness, tenant blockers, security scans, and explicit "do not fake connected providers" rules.

## Biggest weakness

The product ambition is far broader than the live commercial reality. Public sale is blocked, and many exciting integrations are setup-needed, adapter-needed, or blocked.

## Top 5 risks

1. Public launch before tenant isolation is complete.
2. Overpromising Gmail, bank feeds, phone/SMS, Drive, Photos, or autonomous actions before setup is live.
3. WhatsApp runtime/session reliability harming trust.
4. Product scope becoming too broad for normal users.
5. Weak or unproven willingness to pay for the narrow V1 wedge.

## Top 5 questions for Claude Cowork

1. Is this worth more build time this week?
2. Should the wedge be "WhatsApp life admin", "bill/receipt admin", or "scam-safe personal PA"?
3. What must be validated before AppSumo or paid beta?
4. What features should be killed or delayed?
5. What exact offer could get the first 10 paying users?

## Recommended next review action

Ask Claude Cowork for a brutal verdict on whether to TEST FIRST or BUILD NOW. The default recommendation from this pack is TEST FIRST: validate the paid wedge with a controlled demo and a small concierge beta before building more provider integrations.

