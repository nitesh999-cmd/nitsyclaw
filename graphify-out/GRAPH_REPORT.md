# Graph Report - NitsyClaw  (2026-05-03)

## Corpus Check
- 170 files · ~86,926 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 480 nodes · 1028 edges · 14 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 175 edges (avg confidence: 0.8)
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
2. `getDb()` - 23 edges
3. `registerAllFeatures()` - 21 edges
4. `getOwnerIdentity()` - 17 edges
5. `WwebjsClient` - 16 edges
6. `hashPhone()` - 16 edges
7. `makeAgentDeps()` - 15 edges
8. `WhatsAppLoopBreaker` - 14 edges
9. `POST()` - 13 edges
10. `MockWhatsAppClient` - 13 edges

## Surprising Connections (you probably didn't know these)
- `searchAllGmail()` --calls--> `listGoogleAccounts()`  [INFERRED]
  apps\bot\src\adapters.ts → apps\bot\src\google-auth.ts
- `runDailyBuildAgent()` --calls--> `pushNotify()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\notify\index.ts
- `runDailyBuildAgent()` --calls--> `encryptForStorage()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\utils\crypto.ts
- `runDailyBuildAgent()` --calls--> `insertMessage()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\db\repo.ts
- `runDailyBuildAgent()` --calls--> `hashPhone()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\utils\crypto.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (45): runAgent(), pinMemory(), recallMemory(), ToolRegistry, zodToJsonSchema(), dueReminders(), insertExpense(), insertMemory() (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (25): loadCrossSurfaceHistory(), safeDecrypt(), insertMessage(), recentMessages(), haystack(), safeDecrypt(), searchConversationHistory(), pushNotify() (+17 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (24): buildDashboardDeps(), formatLocation(), makeAnthropicLlm(), makeOpenAiEmbedder(), NoopWhatsApp, POST(), getConnectedAccount(), GET() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (33): listPendingFeatureRequests(), buildAgentDeps(), fetchAllEventsToday(), fetchAllUnreadEmails(), formatLocation(), makeAnthropicImageAnalyzer(), makeAnthropicLlm(), makeOpenAiEmbedder() (+25 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (25): loadActivity(), loadToday(), approveSpotifyConfirmation(), loadConfirmations(), rejectConfirmation(), getDb(), setConfirmationStatus(), parseScope() (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (11): isStartupReplay(), WhatsAppEchoGuard, isHealthyWhatsAppState(), isUnhealthyWhatsAppState(), shouldRestartWhatsAppClient(), withTimeout(), isOwnerSelfChat(), normalizeWhatsAppOwnerId() (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (12): insertReminder(), markReminderFired(), upsertBrief(), buildRRuleFromText(), fireDueReminders(), planReminder(), buildBrief(), runMorningBrief() (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.16
Nodes (19): GET(), GET(), missingEnv(), insertConfirmation(), upsertConnectedAccount(), accessToken(), basicAuth(), buildSpotifyAuthorizeUrl() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (16): buildSystemPrompt(), getProfileContext(), insertFeatureRequest(), logAudit(), redactAuditString(), sanitizeAuditPayload(), sanitizeAuditValue(), upsertProfileContext() (+8 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (2): FakeWhatsApp, WhatsAppLoopBreaker

### Community 10 - "Community 10"
Cohesion: 0.23
Nodes (13): authState(), checkDashboardAuth(), clearDashboardAuthAttempts(), constantTimeEqual(), isDashboardAuthConfigured(), isLocked(), parseBasicAuth(), recordDashboardAuthFailure() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.38
Nodes (3): getSystemHeartbeat(), loadHealth(), classifyHeartbeat()

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

- **Why does `getDb()` connect `Community 4` to `Community 1`, `Community 2`, `Community 3`, `Community 7`, `Community 11`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 3` to `Community 4`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **Why does `hashPhone()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 7`, `Community 8`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `getDb()` (e.g. with `main()` and `loadToday()`) actually correct?**
  _`getDb()` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `registerAllFeatures()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`registerAllFeatures()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `getOwnerIdentity()` (e.g. with `POST()` and `GET()`) actually correct?**
  _`getOwnerIdentity()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._