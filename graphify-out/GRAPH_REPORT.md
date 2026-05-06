# Graph Report - NitsyClaw  (2026-05-07)

## Corpus Check
- 274 files · ~152,437 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 904 nodes · 1898 edges · 25 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 342 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 45 edges
2. `ToolRegistry` - 41 edges
3. `cleanText()` - 38 edges
4. `registerAllFeatures()` - 32 edges
5. `requireSameOrigin()` - 28 edges
6. `getOwnerIdentity()` - 23 edges
7. `hashPhone()` - 20 edges
8. `WwebjsClient` - 19 edges
9. `POST()` - 19 edges
10. `publicConfigErrorOrNull()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `makeDeps()` --calls--> `buildAgentDeps()`  [INFERRED]
  apps\bot\src\adapters.test.ts → apps\bot\src\adapters.ts
- `buildAgentDeps()` --calls--> `makeSerperSearch()`  [INFERRED]
  apps\bot\src\adapters.ts → packages\shared\src\search\serper.ts
- `searchAllGmail()` --calls--> `listGoogleAccounts()`  [INFERRED]
  apps\bot\src\adapters.ts → apps\bot\src\google-auth.ts
- `runDailyBuildAgent()` --calls--> `encryptForStorage()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\utils\crypto.ts
- `runDailyBuildAgent()` --calls--> `hashPhone()`  [INFERRED]
  apps\bot\src\build-agent.ts → packages\shared\src\utils\crypto.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (60): runAgent(), ToolRegistry, zodToJsonSchema(), dueReminders(), insertExpense(), insertReminder(), markReminderFired(), restorePendingConfirmation() (+52 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (46): buildDashboardDeps(), formatLocation(), makeAnthropicLlm(), makeOpenAiEmbedder(), NoopWhatsApp, POST(), getOperatorMission(), missionToQueueDescription() (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (42): loadActivity(), loadToday(), loadTodayWithTimeout(), todayTimeoutMs(), loadOperatorState(), approveSpotifyConfirmation(), loadConfirmations(), rejectConfirmation() (+34 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (39): loadCrossSurfaceHistory(), safeDecrypt(), buildSystemPrompt(), safePromptDataValue(), getLatestPendingConfirmation(), getProfileContext(), insertConfirmation(), insertFeatureRequest() (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (15): isStartupReplay(), WhatsAppEchoGuard, isHealthyWhatsAppState(), isUnhealthyWhatsAppState(), publicWhatsAppRuntimeMetadata(), shouldRestartWhatsAppClient(), statusForWhatsAppRuntimeEvent(), withTimeout() (+7 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (46): checkMessageBeforeSending(), cleanMessyNote(), cleanText(), comparePersonalOptions(), createEmergencyCard(), createHabitPlan(), createHomeInventory(), createHouseholdChoreSplit() (+38 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (36): makeSerperSearch(), buildAgentDeps(), fetchAllEventsToday(), fetchAllUnreadEmails(), formatLocation(), makeAnthropicImageAnalyzer(), makeAnthropicLlm(), makeOpenAiEmbedder() (+28 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (35): authState(), checkDashboardAuth(), clearDashboardAuthAttempts(), constantTimeEqual(), isDashboardAuthConfigured(), isLocked(), parseBasicAuth(), recordDashboardAuthFailure() (+27 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (27): constantTimeEqual(), parseScope(), POST(), redirectToSettings(), asCsvUrl(), load(), capRows(), GET() (+19 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (18): insertMessage(), listPendingFeatureRequests(), pushNotify(), sendNtfy(), sendWindowsToast(), runDailyBuildAgent(), parseFeatureRequestShortcut(), cleanCity() (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.15
Nodes (22): GET(), GET(), missingEnv(), deleteConnectedAccount(), getConnectedAccount(), upsertConnectedAccount(), accessToken(), basicAuth() (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (2): FakeWhatsApp, WhatsAppLoopBreaker

### Community 12 - "Community 12"
Cohesion: 0.21
Nodes (19): addFact(), analyzeLifeAdminIntake(), extractAmount(), extractDocumentTextFromMedia(), extractMaskedReference(), extractProvider(), firstUrl(), isBill() (+11 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (12): cleanList(), cleanText(), createAgentRunLog(), createIncidentTimeline(), createMemorySourceLink(), detectStaleMemory(), firstMatch(), parseOneCommandCapture() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.2
Nodes (17): capabilityBoundarySummary(), capabilityMap(), cleanList(), cleanText(), compact(), createFirstDayWizard(), createPeopleMemoryCard(), draftConsentReceipt() (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (9): getSystemHeartbeat(), upsertSystemHeartbeat(), loadHealth(), classifyHeartbeat(), cleanArgValue(), loadLocalEnv(), main(), parseArgs() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (9): buildOperatorRunPlan(), compactTitle(), formatOperatorRunReport(), selectNextOperatorJob(), truncate(), unsafeReasonFor(), loadLocalEnv(), main() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (10): pinMemory(), recallMemory(), insertMemory(), searchMemoriesLexical(), addBirthdayTemplate(), addCantDoItem(), cleanOneLine(), listBirthdayTemplates() (+2 more)

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (7): Confirm-BotRestart(), Get-BotRuntimeProcesses(), Get-DescendantProcessIds(), Restart-Bot(), Start-Bot(), Stop-ProcessTree(), Write-WatchdogHeartbeat()

### Community 19 - "Community 19"
Cohesion: 0.4
Nodes (3): NotFound(), debugEnabled(), DebugPage()

### Community 20 - "Community 20"
Cohesion: 0.5
Nodes (2): Get-DescendantProcessIds(), Stop-ProcessTree()

### Community 21 - "Community 21"
Cohesion: 0.5
Nodes (1): DashboardShell()

### Community 23 - "Community 23"
Cohesion: 0.5
Nodes (1): LoginForm()

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (2): loadEnvFile(), unquoteEnvValue()

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (1): findQuickActionById()

## Knowledge Gaps
- **Thin community `Community 11`** (20 nodes): `whatsapp-loop-breaker.test.ts`, `whatsapp-loop-breaker.ts`, `FakeWhatsApp`, `.destroy()`, `.emit()`, `.onMessage()`, `.ready()`, `.send()`, `WhatsAppLoopBreaker`, `.constructor()`, `.destroy()`, `.isPaused()`, `.isResumeCommand()`, `.normalize()`, `.onMessage()`, `.preview()`, `.prune()`, `.ready()`, `.send()`, `.trip()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (5 nodes): `launch-bot.ps1`, `Get-BotDevProcesses()`, `Get-BotRuntimeProcesses()`, `Get-DescendantProcessIds()`, `Stop-ProcessTree()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (4 nodes): `DashboardShell()`, `RootLayout()`, `dashboard-shell.tsx`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (4 nodes): `login-form.tsx`, `page.tsx`, `LoginForm()`, `SubmitButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (3 nodes): `loadEnvFile()`, `unquoteEnvValue()`, `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (3 nodes): `chat-quick-actions.test.ts`, `chat-quick-actions.ts`, `findQuickActionById()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Community 2` to `Community 0`, `Community 1`, `Community 3`, `Community 6`, `Community 8`, `Community 10`, `Community 15`, `Community 16`?**
  _High betweenness centrality (0.217) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 6` to `Community 2`, `Community 4`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `requireSameOrigin()` connect `Community 1` to `Community 8`, `Community 2`, `Community 7`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Are the 44 inferred relationships involving `getDb()` (e.g. with `main()` and `loadToday()`) actually correct?**
  _`getDb()` has 44 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `registerAllFeatures()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`registerAllFeatures()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `requireSameOrigin()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`requireSameOrigin()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._