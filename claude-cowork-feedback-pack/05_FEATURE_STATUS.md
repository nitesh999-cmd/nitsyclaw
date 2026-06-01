# Feature Status

Status labels:

- Complete
- Partial
- Placeholder
- Broken
- Not found
- Unclear

| Feature | Status | Evidence in files | Risk | Notes |
|---|---|---|---|---|
| WhatsApp text routing | Partial | `apps/bot/src/router.ts`, `apps/bot/test/router.integration.test.ts` | WhatsApp Web session/runtime risk | Recent production smoke passed, but external reliability still matters. |
| WhatsApp voice notes | Partial | `packages/shared/src/features/02-voice-capture.ts`, router transcription paths | Transcription/model/env dependency | Works as a flow, but commercial-grade multilingual voice needs more proof. |
| English reply preference | Partial | System prompt and WhatsApp reply behavior | Some language cases may still mix output | Needs user testing across accents/languages. |
| Reminders | Partial | `03-reminders.ts`, `reminders` table, dashboard `/reminders` | Tenant scoping blocks public sale | Good private-owner feature. |
| Expenses in AUD | Partial | `10-receipt-expense.ts`, `expenses` table, dashboard `/expenses` | Tenant scoping; receipt OCR accuracy | Text/CSV/receipt rails exist; live bank feeds are blocked. |
| Bill summary | Partial | `21-home-assistants.ts`, `extract_bill_summary`, router bill/document paths | Extraction quality varies by input | Good V1 wedge if tested on real bills. |
| Receipt photos | Partial | `processReceiptImage`, image analyzer, expense handling | OCR/image model quality | Needs more fixture testing for AU receipts. |
| CSV expense import | Partial | `import_expenses_csv`, tests around receipt/expense | Data validation risk | Useful local-only feature. |
| Weekly admin digest | Partial | `formatWeeklyAdminDigestReply` in router, snapshot docs | Depends on existing local data | Strong demo feature. |
| What's coming up this week | Partial | Weekly/daily status and reminder logic in router | Command matching may need testing | Useful V1 feature. |
| Admin inbox/pending items | Partial | command jobs, confirmations, feature queue | Can become too operator-heavy | Should be simplified for customers. |
| Memory/search | Partial | `06-memory-recall.ts`, `12-whatsapp-history.ts`, `profile_context` | Stale memory/privacy risk | Needs memory review and tenant controls. |
| Draft SMS/replies/complaints | Partial | `19-integration-requests.ts`, `21-home-assistants.ts` | User may expect real sending | Must keep "draft only" copy clear. |
| Real SMS sending | Not found | Provider readiness says approval/provider required | Wrong recipient/legal risk | Not live. |
| Phone calls | Not found | Provider readiness says approval/provider required | High risk | Not live. |
| Gmail live actions | Placeholder | Gmail connector/status/readiness files | OAuth/scopes/privacy risk | Needs setup; no claims should be made. |
| Outlook live actions | Placeholder | Outlook connector/status/readiness files | OAuth/scopes/privacy risk | Needs setup; no claims should be made. |
| Google Drive browsing | Placeholder | Drive connector/readiness files | Broad file access privacy risk | Needs selected-file adapter/scopes. |
| OneDrive browsing | Placeholder | OneDrive connector/readiness files | Broad file access privacy risk | Needs selected-file adapter/scopes. |
| Google Photos | Placeholder | Provider readiness and queued integration requests | Very sensitive data | Adapter not wired. |
| Spotify | Partial | Spotify OAuth routes and shared Spotify feature files | Account token/setup risk | App/env and account setup required; playlist creation must stay confirmation-gated. |
| Bank feeds | Broken / blocked | Provider readiness says blocked | Compliance/consent risk | Use CSV/manual until provider selected. |
| Facebook birthdays | Placeholder | Birthday import queue/request tools | Scraping/privacy/platform risk | Manual/CSV/contact import first. |
| Social video analysis | Placeholder | Queue request tool and provider readiness | Platform/scraping risk | Public URL/upload adapter not wired. |
| Dashboard login | Partial | `api/auth/login`, login tests, auth attempt table | Not a proper multi-user auth model | Private-owner only. |
| Public sale readiness | Broken / blocked | `customer:check`, `tenant:check`, tenancy tests | Cross-customer data leakage risk | Must not launch publicly. |
| CI/release gates | Complete | `.github/workflows/ci.yml`, scripts, recent run passed | Can still miss business/user bugs | Strong technical gate coverage. |
| Data export/delete | Partial | `api/data/export`, `api/data/delete`, privacy tests | Tenant scoping and redaction need review | Essential before customer beta. |
| Debug/operator pages | Partial | dashboard owner tools | Customer confusion/security surface | Hidden/de-emphasised in nav but still present behind auth. |

