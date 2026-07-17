import { PA_EVALUATION_SCENARIOS, runPaEvaluation, summarizePaEvaluation } from "@nitsyclaw/shared/local-brain";

const results = runPaEvaluation();
const summary = summarizePaEvaluation(results);
const routes = PA_EVALUATION_SCENARIOS.reduce((counts, scenario) => {
  counts[scenario.expectedRoute] += 1;
  return counts;
}, { local: 0, cloud: 0, blocked: 0 });
console.log(JSON.stringify({
  summary,
  policyRouting: {
    ...routes,
    localRateAmongPermitted: routes.local / (routes.local + routes.cloud),
    runtimeFallbackRate: "not_measured_no_live_model",
  },
  failures: results.filter((result) => !result.passed),
}, null, 2));
if (summary.passed !== summary.total) process.exitCode = 1;
