# Ollama Setup for NitsyClaw

## Detected environment

- Ollama executable: `C:\Users\Nitesh\AppData\Local\Programs\Ollama\ollama.exe`
- Version checked during this sprint: 0.32.1
- Service: reachable at `http://127.0.0.1:11434`
- Models detected during this sprint: none
- System memory: about 63 GB RAM
- GPU/VRAM: not verified, so the primary recommendation is deliberately conservative

## Recommended models

Primary chat/tool model:

```powershell
& 'C:\Users\Nitesh\AppData\Local\Programs\Ollama\ollama.exe' pull qwen3:8b
```

Why: `qwen3:8b` is about 5.2 GB, supports tool use and thinking, and is a practical quality/speed starting point without assuming a specific GPU. If measured latency and memory headroom are good, `qwen3:14b` is the next quality experiment, not the default.

Local embedding model:

```powershell
& 'C:\Users\Nitesh\AppData\Local\Programs\Ollama\ollama.exe' pull nomic-embed-text
```

Why: small, embedding-only, broadly supported by Ollama, and sufficient for a first local-memory reranking path. It must not be written into the existing 1536-dimensional vector column.

Official references: [Qwen3 model library](https://ollama.com/library/qwen3), [nomic-embed-text model library](https://ollama.com/library/nomic-embed-text), [Ollama chat API](https://docs.ollama.com/api/chat), [Ollama embed API](https://docs.ollama.com/api/embed).

## Configuration

Copy `.env.local.example` to `.env.local` if needed and set:

```dotenv
NITSYCLAW_MODEL_MODE="auto"
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_CHAT_MODEL="qwen3:8b"
OLLAMA_EMBEDDING_MODEL="nomic-embed-text"
OLLAMA_TIMEOUT_MS="45000"
OLLAMA_RETRIES="1"
OLLAMA_CONTEXT_LIMIT="16384"
OLLAMA_KEEP_ALIVE="5m"
```

Modes:

- `local_only`: never use cloud models. If Ollama is unavailable, stop honestly.
- `auto`: classify the complete outbound context, keep any private context local, and use cloud only for wholly ordinary difficult work or an explicit full-context escalation.
- `best_reasoning`: prefer configured cloud reasoning only when the complete outbound context is ordinary; private context still requires the exact full-context approval prefix.

Per-turn sensitive escalation syntax:

```text
cloud approved for this full conversation context: <request>
```

Without that exact prefix, earlier private history and tool results make the route local or blocked. The owner profile block is always omitted from cloud prompts. Saved-memory embeddings remain local-only even when a chat turn is approved for cloud.

## Verify and launch

```powershell
npm run local-brain:doctor
npm run local-brain:eval
npm run local-brain:benchmark
npm run bot
```

In a second terminal:

```powershell
npm run dashboard
```

Expected doctor state is `online` with both exact model names. `degraded` means Ollama is reachable but a configured model is missing. `offline` means the endpoint cannot be reached.

## Troubleshooting

- `Ollama is running but chat model ... is not installed`: run the exact chat pull command and verify spelling with `ollama list`.
- `local-only mode ... unavailable`: start the Ollama desktop service, then rerun the doctor.
- Timeout on first call: model cold-load can be slower. Keep the 45-second initial timeout, measure with the benchmark, and only then tune.
- Dashboard on Vercel reports offline: expected for laptop loopback. Run the local dashboard for laptop Ollama; do not expose port 11434 publicly.
- Private memory embedding blocked: install/configure the local embedding model. NitsyClaw intentionally refuses silent cloud embedding for private text.
