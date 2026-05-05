# Nuclear Vercel + DeepSec Audit Standard

## Trigger
When asked for audit, QA, review, test, launch check, DeepSec, Vercel check, security scan, or nuclear proof review, run this full standard.

## Mission
Make the project production-grade, investor-grade, user-safe, Vercel-ready, and difficult to break.

## Required Audit Layers

### 1. Product Understanding
Identify:
- What the app does
- Target user
- Core user journeys
- Business goal
- Critical flows
- External APIs/services
- Data collected
- Privacy/security/compliance exposure

### 2. Code Audit
Check:
- Frontend
- Backend/API routes
- Auth/session logic
- Forms and validation
- File uploads
- Database/storage
- Error handling
- Logging
- Analytics
- Environment variables
- Build/deployment config
- Mobile UX
- Accessibility
- SEO/meta
- Misleading copy

### 3. Deep Security
Check for:
- XSS
- CSRF
- Injection
- API abuse
- Direct API bypass
- File upload abuse
- Exposed secrets
- Unsafe env usage
- Weak validation
- Missing rate limits
- Leaky errors
- Sensitive data in logs
- Dependency vulnerabilities

### 4. Vercel Readiness
Check:
- vercel.json
- package.json
- Next.js config
- Build command
- Output directory
- Node version
- Edge/runtime compatibility
- API timeouts
- File upload limits
- Redirects/rewrites
- Headers
- Caching
- Production build behaviour

### 5. Red-Team Break Tests
Try:
- Empty inputs
- Huge inputs
- Invalid emails/phones
- Strange characters
- Emojis
- Script injection payloads
- Wrong file types
- Huge files
- Corrupt files
- Double clicks
- Refresh/back behaviour
- Slow network
- Offline state
- API 500/401/403/429
- Missing env vars
- Malformed JSON
- Bot/spam behaviour

## Required Commands Where Available

Run:
- npm install
- npm run build
- npm run lint
- npm run typecheck
- npm test
- npm audit
- snyk test
- semgrep scan --config auto
- vercel build

If any command is missing, report it.
If any command fails, diagnose it.
If fixable, fix it.
If not fixable, mark it clearly.

## Severity Levels

P0 CRITICAL:
App cannot build, Vercel deploy blocked, core flow broken, data loss, security/privacy exposure, false or misleading output, lead/payment failure, production crash.

P1 HIGH:
Major UX failure, mobile failure, weak validation, unreliable API handling, poor error handling, missing core tests, Vercel runtime risk.

P2 MEDIUM:
Edge-case bugs, maintainability issues, performance issues, confusing UX, incomplete observability.

P3 LOW:
Minor cleanup only if low-risk.

## Fixing Rules
- Fix P0 first
- Fix P1 second
- Fix quick safe P2 only after that
- No broad rewrite unless necessary
- Add tests where useful
- Re-run verification after fixes

## Final Report Required
Include:
1. Release readiness score out of 10
2. Ship decision: SAFE TO SHIP / SHIP WITH RISKS / DO NOT SHIP
3. What the product does
4. Critical flows tested
5. Security risks found
6. Vercel risks found
7. Issues by P0/P1/P2/P3
8. Fixes completed
9. Files changed
10. Commands run
11. Pass/fail results
12. Remaining risks
13. Unverified items
14. Top 5 next actions
