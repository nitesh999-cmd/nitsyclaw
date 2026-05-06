# Graph Report - NitsyClaw  (2026-05-05)

## Corpus Check
- 243 files · ~114,336 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 692 nodes · 1441 edges · 20 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 259 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]

## God Nodes (most connected - your core abstractions)
1. `ToolRegistry` - 37 edges
2. `getDb()` - 35 edges
3. `requireSameOrigin()` - 24 edges
4. `registerAllFeatures()` - 24 edges
5. `getOwnerIdentity()` - 23 edges
6. `hashPhone()` - 20 edges
7. `publicConfigErrorOrNull()` - 19 edges
8. `makeAgentDeps()` - 19 edges
9. `WwebjsClient` - 18 edges
10. `POST()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `searchAllGmail()` --calls--> `listGoogleAccounts()`  [INFERRED]
  apps\bot\src\adapters.ts → apps\bot\src\google-auth.ts
- `runDailyBuildAgent()` --calls--> `encryptForStorage()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\utils\crypto.ts
- `runDailyBuildAgent()` --calls--> `insertMessage()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\db\repo.ts
- `runDailyBuildAgent()` --calls--> `hashPhone()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\utils\crypto.ts
- `main()` --calls--> `getDb()`  [INFERRED]
  apps\bot\src\index.ts → packages\shared\src\db\client.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (56): runAgent(), ToolRegistry, zodToJsonSchema(), dueReminders(), insertExpense(), insertReminder(), markReminderFired(), restorePendingConfirmation() (+48 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (38): loadCrossSurfaceHistory(), GET(), buildDashboardDeps(), formatLocation(), makeAnthropicLlm(), makeOpenAiEmbedder(), POST(), getOperatorMission() (+30 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (14): isStartupReplay(), WhatsAppEchoGuard, isHealthyWhatsAppState(), isUnhealthyWhatsAppState(), publicWhatsAppRuntimeMetadata(), shouldRestartWhatsAppClient(), statusForWhatsAppRuntimeEvent(), withTimeout() (+6 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (31): safeDecrypt(), buildSystemPrompt(), getProfileContext(), insertConfirmation(), recentMessages(), upsertProfileContext(), haystack(), safeDecrypt() (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (26): loadActivity(), loadToday(), loadOperatorState(), approveSpotifyConfirmation(), loadConfirmations(), rejectConfirmation(), getDb(), setConfirmationStatus() (+18 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (24): pinMemory(), recallMemory(), getLatestPendingConfirmation(), getSystemHeartbeat(), insertMemory(), logAudit(), redactAuditString(), sanitizeAuditPayload() (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (31): buildAgentDeps(), fetchAllEventsToday(), fetchAllUnreadEmails(), formatLocation(), makeAnthropicImageAnalyzer(), makeAnthropicLlm(), makeOpenAiEmbedder(), makeOpenAiTranscriber() (+23 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (27): constantTimeEqual(), parseScope(), POST(), redirectToSettings(), asCsvUrl(), load(), capRows(), GET() (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (26): authState(), checkDashboardAuth(), clearDashboardAuthAttempts(), constantTimeEqual(), isLocked(), parseBasicAuth(), recordDashboardAuthFailure(), base64UrlDecode() (+18 more)

### Community 9 - "Community 9"
Cohesion: 0.16
Nodes (14): listPendingFeatureRequests(), pushNotify(), sendNtfy(), sendWindowsToast(), runDailyBuildAgent(), parseFeatureRequestShortcut(), cleanCity(), cleanHint() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.15
Nodes (21): GET(), missingEnv(), deleteConnectedAccount(), getConnectedAccount(), upsertConnectedAccount(), accessToken(), basicAuth(), buildSpotifyAuthorizeUrl() (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (2): FakeWhatsApp, WhatsAppLoopBreaker

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (12): setFeatureRequestStatus(), buildOperatorRunPlan(), compactTitle(), formatOperatorRunReport(), selectNextOperatorJob(), truncate(), unsafeReasonFor(), loadLocalEnv() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.5
Nodes (7): Confirm-BotRestart(), Get-BotRuntimeProcesses(), Get-DescendantProcessIds(), Restart-Bot(), Start-Bot(), Stop-ProcessTree(), Write-WatchdogHeartbeat()

### Community 14 - "Community 14"
Cohesion: 0.5
Nodes (2): Get-DescendantProcessIds(), Stop-ProcessTree()

### Community 15 - "Community 15"
Cohesion: 0.4
Nodes (1): NoopWhatsApp

### Community 16 - "Community 16"
Cohesion: 0.4
Nodes (1): NoopWhatsApp

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (1): DashboardShell()

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (2): loadEnvFile(), unquoteEnvValue()

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (2): debugEnabled(), DebugPage()

## Knowledge Gaps
- **Thin community `Community 11`** (20 nodes): `whatsapp-loop-breaker.test.ts`, `whatsapp-loop-breaker.ts`, `FakeWhatsApp`, `.destroy()`, `.emit()`, `.onMessage()`, `.ready()`, `.send()`, `WhatsAppLoopBreaker`, `.constructor()`, `.destroy()`, `.isPaused()`, `.isResumeCommand()`, `.normalize()`, `.onMessage()`, `.preview()`, `.prune()`, `.ready()`, `.send()`, `.trip()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (5 nodes): `launch-bot.ps1`, `Get-BotDevProcesses()`, `Get-BotRuntimeProcesses()`, `Get-DescendantProcessIds()`, `Stop-ProcessTree()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (5 nodes): `NoopWhatsApp`, `.destroy()`, `.onMessage()`, `.ready()`, `.send()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (5 nodes): `NoopWhatsApp`, `.destroy()`, `.onMessage()`, `.ready()`, `.send()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (4 nodes): `DashboardShell()`, `RootLayout()`, `dashboard-shell.tsx`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (3 nodes): `loadEnvFile()`, `unquoteEnvValue()`, `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (3 nodes): `page.tsx`, `debugEnabled()`, `DebugPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Community 4` to `Community 0`, `Community 1`, `Community 5`, `Community 6`, `Community 7`, `Community 12`?**
  _High betweenness centrality (0.243) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 6` to `Community 2`, `Community 4`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Why does `requireSameOrigin()` connect `Community 1` to `Community 4`, `Community 12`, `Community 7`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 34 inferred relationships involving `getDb()` (e.g. with `main()` and `loadToday()`) actually correct?**
  _`getDb()` has 34 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `requireSameOrigin()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`requireSameOrigin()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `registerAllFeatures()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`registerAllFeatures()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `getOwnerIdentity()` (e.g. with `POST()` and `GET()`) actually correct?**
  _`getOwnerIdentity()` has 11 INFERRED edges - model-reasoned connections that need verification._