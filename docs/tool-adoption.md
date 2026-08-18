# Tool Adoption Register

NitsyClaw is a WhatsApp-first personal PA. New tools must reduce launch risk without adding unnecessary cost, token load, secret exposure, or maintenance burden.

## Current decision

Adopt the boring reliable stack first:

- Keep `Semgrep`, `npm audit`, `Playwright`, Vitest, lint, typecheck, build, and the existing CI workflow.
- Add only small read-only Claude Code reviewers for focused critique.
- Do not clone or bulk-install community skill/agent repositories into this repo.
- Treat Lighthouse as manual investigation only until it is stable on the current machine or in CI.

## Evaluated resources

| Resource | Fit | Decision | Reason |
|---|---:|---|---|
| addyosmani/agent-skills | Medium | Reference only | Strong skill patterns, but bulk install would add unaudited prompts and extra operating surface. |
| wshobson/agents | Medium | Reference only | Useful agent examples, but not project-specific enough to install directly. |
| VoltAgent/awesome-agent-skills | Medium | Reference only | Good discovery catalog, not a dependency source. |
| ComposioHQ/awesome-codex-skills | Medium | Reference only | Useful Codex skill catalog; install individual skills only after review and a direct need. |
| VoltAgent/awesome-claude-code-subagents | Medium | Reference only | Good subagent examples; prefer project-authored read-only reviewers. |
| RepoAudit | Low now | Reject for V1 | Autonomous repo auditor overlaps with existing gates and adds setup/model cost. Revisit later for periodic offline review. |
| Semgrep | High | Keep | Low-cost static security scan already wired into local scripts and CI. |
| Playwright | High | Keep | Best fit for real dashboard route, mobile, and destructive-action flow checks. |
| Lighthouse | Medium | Manual only | Useful for performance/SEO, but local Windows Chrome cleanup was flaky after report generation. |
| npm audit | High | Keep | Low-cost dependency advisory gate. It is not enough alone, but valuable with Semgrep. |
| Ollama 0.32.1 | High for owner-local PA | Adopt behind adapter | Already installed and reachable; HTTP-native adapter adds no package. Manual exact-name model pulls and local-only networking keep supply-chain and privacy risk visible. |
| qwen3:8b | High, pending live proof | Recommended first model | Tool-capable 8B model is a conservative starting point for the 63 GB RAM machine; live quality/latency must be measured before stickier adoption. |
| nomic-embed-text | Medium-high, pending live proof | Recommended first embedder | Small local embedding model; use bounded in-memory reranking until a dimension-aware schema is designed. |
| Handy 0.9.4 | High for owner-local WhatsApp voice | Reuse installed binary | Offline ASR, MIT source, fixed CLI arguments, exact binary path, and no cloud transport. Do not bundle or auto-install it. |
| Nemotron 3.5 ASR 0.6B Q8 GGUF | High for English/Hindi ASR | Reuse installed allowlisted model | OpenMDW-1.1, multilingual, and already present. Exact model path is allowlisted; no download or fallback is permitted. |
| FFmpeg/ffprobe 8.1.2 Gyan full build | High for strict audio boundaries | Reuse installed executables | Required for safe probe/decode/Opus conversion. GPLv3 external tool; invoke only and do not redistribute. |
| Windows System.Speech | Conditional for voice output | Owner-only English/Hinglish bridge | Already part of Windows and requires no model install, but naturalness/Hindi quality is below the final target. Hindi remains approval-gated. |

## Adoption rules

1. Prefer tools already in `package.json` and CI.
2. Install nothing permanently until a local proof shows clear value.
3. Do not copy third-party prompts or agents without reading the full file.
4. Project agents must be read-only by default.
5. Any agent/tool that can write files, run shell commands, deploy, send messages, or access secrets needs explicit review.
6. Do not claim a tool is part of release readiness until `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, `pnpm run security:audit`, and `pnpm run security:semgrep` still pass.
7. Never expose Ollama's unauthenticated local API to the public internet. Any future network bridge needs authentication, encryption, IP restrictions, and a threat-model update.

