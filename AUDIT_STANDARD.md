# Nuclear Audit Standard

1. Read PROJECT_MAP.md first
2. Identify frontend/backend
3. Run:
   - npm install
   - npm run build
   - npm audit
   - snyk test
   - semgrep scan --config auto
   - vercel build

4. Output:
   - P0/P1/P2/P3 issues
   - Fix P0/P1
   - Ship decision
