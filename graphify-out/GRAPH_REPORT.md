# Graph Report - NitsyClaw  (2026-05-03)

## Corpus Check
- 172 files · ~87,944 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 485 nodes · 1040 edges · 14 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 179 edges (avg confidence: 0.8)
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
1. `ToolRegistry` - 31 edges
2. `getDb()` - 24 edges
3. `registerAllFeatures()` - 21 edges
4. `getOwnerIdentity()` - 17 edges
5. `WwebjsClient` - 16 edges
6. `hashPhone()` - 16 edges
7. `makeAgentDeps()` - 15 edges
8. `WhatsAppLoopBreaker` - 14 edges
9. `POST()` - 13 edges
10. `MockWhatsAppClient` - 13 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `buildAgentDeps()`  [INFERRED]
  apps\bot\src\index.ts → apps\bot\src\adapters.ts
- `searchAllGmail()` --calls--> `listGoogleAccounts()`  [INFERRED]
  apps\bot\src\adapters.ts → apps\bot\src\google-auth.ts
- `runDailyBuildAgent()` --calls--> `encryptForStorage()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\utils\crypto.ts
- `runDailyBuildAgent()` --calls--> `hashPhone()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\utils\crypto.ts
- `main()` --calls--> `getDb()`  [INFERRED]
  apps\bot\src\index.ts → packages\shared\src\db\client.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (33): ToolRegistry, zodToJsonSchema(), dueReminders(), insertExpense(), classifyTextCommand(), registerTextCommand(), registerVoiceCapture(), transcribeAndStore() (+25 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (24): loadCrossSurfaceHistory(), buildDashboardDeps(), formatLocation(), makeAnthropicLlm(), makeOpenAiEmbedder(), NoopWhatsApp, POST(), GET() (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (26): loadActivity(), loadToday(), approveSpotifyConfirmation(), loadConfirmations(), rejectConfirmation(), getDb(), setFeatureRequestStatus(), parseScope() (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (11): isStartupReplay(), WhatsAppEchoGuard, isHealthyWhatsAppState(), isUnhealthyWhatsAppState(), shouldRestartWhatsAppClient(), withTimeout(), isOwnerSelfChat(), normalizeWhatsAppOwnerId() (+3 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (21): runAgent(), pinMemory(), recallMemory(), getSystemHeartbeat(), insertMemory(), logAudit(), redactAuditString(), sanitizeAuditPayload() (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (18): insertMessage(), listPendingFeatureRequests(), pushNotify(), sendNtfy(), sendWindowsToast(), runDailyBuildAgent(), loadEnv(), resetEnvCache() (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (25): safeDecrypt(), buildSystemPrompt(), getProfileContext(), insertFeatureRequest(), recentMessages(), upsertProfileContext(), haystack(), safeDecrypt() (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (27): buildAgentDeps(), fetchAllEventsToday(), fetchAllUnreadEmails(), formatLocation(), makeAnthropicImageAnalyzer(), makeAnthropicLlm(), makeOpenAiEmbedder(), makeOpenAiTranscriber() (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (12): insertReminder(), markReminderFired(), upsertBrief(), buildRRuleFromText(), fireDueReminders(), planReminder(), buildBrief(), runMorningBrief() (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (20): GET(), GET(), missingEnv(), getConnectedAccount(), insertConfirmation(), upsertConnectedAccount(), accessToken(), basicAuth() (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (2): FakeWhatsApp, WhatsAppLoopBreaker

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
- **Thin community `Community 10`** (20 nodes): `whatsapp-loop-breaker.test.ts`, `whatsapp-loop-breaker.ts`, `FakeWhatsApp`, `.destroy()`, `.emit()`, `.onMessage()`, `.ready()`, `.send()`, `WhatsAppLoopBreaker`, `.constructor()`, `.destroy()`, `.isPaused()`, `.isResumeCommand()`, `.normalize()`, `.onMessage()`, `.preview()`, `.prune()`, `.ready()`, `.send()`, `.trip()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (5 nodes): `launch-bot.ps1`, `Get-BotDevProcesses()`, `Get-BotRuntimeProcesses()`, `Get-DescendantProcessIds()`, `Stop-ProcessTree()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Community 2` to `Community 1`, `Community 4`, `Community 5`, `Community 9`?**
  _High betweenness centrality (0.198) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 5` to `Community 2`, `Community 7`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `hashPhone()` connect `Community 6` to `Community 0`, `Community 9`, `Community 5`, `Community 1`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Are the 23 inferred relationships involving `getDb()` (e.g. with `main()` and `loadToday()`) actually correct?**
  _`getDb()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `registerAllFeatures()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`registerAllFeatures()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `getOwnerIdentity()` (e.g. with `POST()` and `GET()`) actually correct?**
  _`getOwnerIdentity()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._