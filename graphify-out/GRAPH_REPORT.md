# Graph Report - NitsyClaw  (2026-05-04)

## Corpus Check
- 185 files · ~94,487 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 516 nodes · 1130 edges · 14 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 197 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `ToolRegistry` - 37 edges
2. `getDb()` - 24 edges
3. `registerAllFeatures()` - 24 edges
4. `hashPhone()` - 20 edges
5. `makeAgentDeps()` - 19 edges
6. `getOwnerIdentity()` - 17 edges
7. `WwebjsClient` - 16 edges
8. `WhatsAppLoopBreaker` - 14 edges
9. `POST()` - 14 edges
10. `POST()` - 13 edges

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
Cohesion: 0.07
Nodes (38): runAgent(), ToolRegistry, zodToJsonSchema(), insertExpense(), restorePendingConfirmation(), classifyTextCommand(), registerTextCommand(), registerVoiceCapture() (+30 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (32): loadCrossSurfaceHistory(), buildDashboardDeps(), formatLocation(), makeAnthropicLlm(), makeOpenAiEmbedder(), NoopWhatsApp, POST(), setFeatureRequestStatus() (+24 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (22): dueReminders(), getLatestPendingConfirmation(), getSystemHeartbeat(), insertReminder(), logAudit(), markReminderFired(), redactAuditString(), sanitizeAuditPayload() (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (32): safeDecrypt(), buildSystemPrompt(), getProfileContext(), insertConfirmation(), insertFeatureRequest(), recentMessages(), upsertProfileContext(), haystack() (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (11): isStartupReplay(), WhatsAppEchoGuard, isHealthyWhatsAppState(), isUnhealthyWhatsAppState(), shouldRestartWhatsAppClient(), withTimeout(), isOwnerSelfChat(), normalizeWhatsAppOwnerId() (+3 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (31): buildAgentDeps(), fetchAllEventsToday(), fetchAllUnreadEmails(), formatLocation(), makeAnthropicImageAnalyzer(), makeAnthropicLlm(), makeOpenAiEmbedder(), makeOpenAiTranscriber() (+23 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (22): loadActivity(), loadToday(), approveSpotifyConfirmation(), loadConfirmations(), rejectConfirmation(), getDb(), setConfirmationStatus(), addExpense() (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.16
Nodes (15): insertMessage(), listPendingFeatureRequests(), pushNotify(), sendNtfy(), sendWindowsToast(), runDailyBuildAgent(), parseFeatureRequestShortcut(), cleanCity() (+7 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (19): GET(), GET(), missingEnv(), getConnectedAccount(), upsertConnectedAccount(), accessToken(), basicAuth(), buildSpotifyAuthorizeUrl() (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (2): FakeWhatsApp, WhatsAppLoopBreaker

### Community 10 - "Community 10"
Cohesion: 0.2
Nodes (12): pinMemory(), recallMemory(), insertMemory(), searchMemoriesLexical(), transcribeAndStore(), addBirthdayTemplate(), addCantDoItem(), cleanOneLine() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.23
Nodes (13): authState(), checkDashboardAuth(), clearDashboardAuthAttempts(), constantTimeEqual(), isDashboardAuthConfigured(), isLocked(), parseBasicAuth(), recordDashboardAuthFailure() (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.53
Nodes (4): Get-DescendantProcessIds(), Restart-Bot(), Start-Bot(), Stop-ProcessTree()

### Community 13 - "Community 13"
Cohesion: 0.5
Nodes (2): Get-DescendantProcessIds(), Stop-ProcessTree()

## Knowledge Gaps
- **Thin community `Community 9`** (20 nodes): `whatsapp-loop-breaker.test.ts`, `whatsapp-loop-breaker.ts`, `FakeWhatsApp`, `.destroy()`, `.emit()`, `.onMessage()`, `.ready()`, `.send()`, `WhatsAppLoopBreaker`, `.constructor()`, `.destroy()`, `.isPaused()`, `.isResumeCommand()`, `.normalize()`, `.onMessage()`, `.preview()`, `.prune()`, `.ready()`, `.send()`, `.trip()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (5 nodes): `launch-bot.ps1`, `Get-BotDevProcesses()`, `Get-BotRuntimeProcesses()`, `Get-DescendantProcessIds()`, `Stop-ProcessTree()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Community 6` to `Community 8`, `Community 1`, `Community 2`, `Community 5`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 5` to `Community 6`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Why does `hashPhone()` connect `Community 3` to `Community 0`, `Community 8`, `Community 1`, `Community 7`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Are the 23 inferred relationships involving `getDb()` (e.g. with `main()` and `loadToday()`) actually correct?**
  _`getDb()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `registerAllFeatures()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`registerAllFeatures()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `hashPhone()` (e.g. with `runDailyBuildAgent()` and `.sendAndPersist()`) actually correct?**
  _`hashPhone()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `makeAgentDeps()` (e.g. with `setup()` and `setup()`) actually correct?**
  _`makeAgentDeps()` has 3 INFERRED edges - model-reasoned connections that need verification._