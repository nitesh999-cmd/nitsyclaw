# Graph Report - NitsyClaw  (2026-05-04)

## Corpus Check
- 182 files · ~93,520 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 510 nodes · 1115 edges · 15 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 193 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]

## God Nodes (most connected - your core abstractions)
1. `ToolRegistry` - 37 edges
2. `getDb()` - 24 edges
3. `registerAllFeatures()` - 24 edges
4. `hashPhone()` - 20 edges
5. `makeAgentDeps()` - 19 edges
6. `getOwnerIdentity()` - 17 edges
7. `WwebjsClient` - 16 edges
8. `WhatsAppLoopBreaker` - 14 edges
9. `POST()` - 13 edges
10. `MockWhatsAppClient` - 13 edges

## Surprising Connections (you probably didn't know these)
- `searchAllGmail()` --calls--> `listGoogleAccounts()`  [INFERRED]
  apps\bot\src\adapters.ts → apps\bot\src\google-auth.ts
- `runDailyBuildAgent()` --calls--> `encryptForStorage()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\utils\crypto.ts
- `runDailyBuildAgent()` --calls--> `hashPhone()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\utils\crypto.ts
- `main()` --calls--> `getDb()`  [INFERRED]
  apps\bot\src\index.ts → packages\shared\src\db\client.ts
- `loadToday()` --calls--> `getDb()`  [INFERRED]
  apps\dashboard\src\app\page.tsx → packages\shared\src\db\client.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (36): runAgent(), ToolRegistry, zodToJsonSchema(), insertExpense(), classifyTextCommand(), registerTextCommand(), registerVoiceCapture(), transcribeAndStore() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (23): dueReminders(), insertReminder(), logAudit(), markReminderFired(), redactAuditString(), restorePendingConfirmation(), sanitizeAuditPayload(), sanitizeAuditValue() (+15 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (24): loadCrossSurfaceHistory(), buildDashboardDeps(), formatLocation(), makeAnthropicLlm(), makeOpenAiEmbedder(), NoopWhatsApp, POST(), GET() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (32): safeDecrypt(), buildSystemPrompt(), getProfileContext(), insertConfirmation(), insertFeatureRequest(), recentMessages(), upsertProfileContext(), haystack() (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (26): loadActivity(), loadToday(), approveSpotifyConfirmation(), loadConfirmations(), rejectConfirmation(), getDb(), setFeatureRequestStatus(), parseScope() (+18 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (11): isStartupReplay(), WhatsAppEchoGuard, isHealthyWhatsAppState(), isUnhealthyWhatsAppState(), shouldRestartWhatsAppClient(), withTimeout(), isOwnerSelfChat(), normalizeWhatsAppOwnerId() (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (31): buildAgentDeps(), fetchAllEventsToday(), fetchAllUnreadEmails(), formatLocation(), makeAnthropicImageAnalyzer(), makeAnthropicLlm(), makeOpenAiEmbedder(), makeOpenAiTranscriber() (+23 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (16): getLatestPendingConfirmation(), insertMessage(), listPendingFeatureRequests(), pushNotify(), sendNtfy(), sendWindowsToast(), runDailyBuildAgent(), parseFeatureRequestShortcut() (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (19): GET(), GET(), missingEnv(), getConnectedAccount(), upsertConnectedAccount(), accessToken(), basicAuth(), buildSpotifyAuthorizeUrl() (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (2): FakeWhatsApp, WhatsAppLoopBreaker

### Community 10 - "Community 10"
Cohesion: 0.23
Nodes (13): authState(), checkDashboardAuth(), clearDashboardAuthAttempts(), constantTimeEqual(), isDashboardAuthConfigured(), isLocked(), parseBasicAuth(), recordDashboardAuthFailure() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (10): pinMemory(), recallMemory(), insertMemory(), searchMemoriesLexical(), addBirthdayTemplate(), addCantDoItem(), cleanOneLine(), listBirthdayTemplates() (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.38
Nodes (3): getSystemHeartbeat(), loadHealth(), classifyHeartbeat()

### Community 13 - "Community 13"
Cohesion: 0.53
Nodes (4): Get-DescendantProcessIds(), Restart-Bot(), Start-Bot(), Stop-ProcessTree()

### Community 14 - "Community 14"
Cohesion: 0.5
Nodes (2): Get-DescendantProcessIds(), Stop-ProcessTree()

## Knowledge Gaps
- **Thin community `Community 9`** (20 nodes): `whatsapp-loop-breaker.test.ts`, `whatsapp-loop-breaker.ts`, `FakeWhatsApp`, `.destroy()`, `.emit()`, `.onMessage()`, `.ready()`, `.send()`, `WhatsAppLoopBreaker`, `.constructor()`, `.destroy()`, `.isPaused()`, `.isResumeCommand()`, `.normalize()`, `.onMessage()`, `.preview()`, `.prune()`, `.ready()`, `.send()`, `.trip()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (5 nodes): `launch-bot.ps1`, `Get-BotDevProcesses()`, `Get-BotRuntimeProcesses()`, `Get-DescendantProcessIds()`, `Stop-ProcessTree()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Community 4` to `Community 1`, `Community 2`, `Community 6`, `Community 8`, `Community 12`?**
  _High betweenness centrality (0.184) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 6` to `Community 4`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Why does `hashPhone()` connect `Community 3` to `Community 0`, `Community 8`, `Community 2`, `Community 7`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Are the 23 inferred relationships involving `getDb()` (e.g. with `main()` and `loadToday()`) actually correct?**
  _`getDb()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `registerAllFeatures()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`registerAllFeatures()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `hashPhone()` (e.g. with `runDailyBuildAgent()` and `.sendAndPersist()`) actually correct?**
  _`hashPhone()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `makeAgentDeps()` (e.g. with `setup()` and `setup()`) actually correct?**
  _`makeAgentDeps()` has 3 INFERRED edges - model-reasoned connections that need verification._