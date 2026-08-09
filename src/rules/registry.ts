import { isRuleEnabled, isSuppressed, severityFor } from "../config.js";
import type { Finding, Rule, RuleContext } from "../types.js";
import { workflowRules } from "./workflow-security.js";
import { repositoryRules } from "./repository-health.js";

export const builtInRules: Rule[] = [...workflowRules, ...repositoryRules];

export async function runRules(context: RuleContext, rules: Rule[] = builtInRules): Promise<{ findings: Finding[]; executedRules: string[]; skippedRules: Array<{ ruleId: string; reason: string }> }> {
  const findings: Finding[] = [];
  const executedRules: string[] = [];
  const skippedRules: Array<{ ruleId: string; reason: string }> = [];

  for (const candidate of rules) {
    if (!isRuleEnabled(candidate.meta.id, context.config, candidate.meta.category)) {
      skippedRules.push({ ruleId: candidate.meta.id, reason: "disabled by configuration" });
      continue;
    }
    executedRules.push(candidate.meta.id);
    for (const finding of await candidate.run(context)) {
      if (isSuppressed(candidate.meta.id, finding.location?.path, context.config)) continue;
      findings.push({ ...finding, severity: severityFor(candidate.meta.id, finding.severity, context.config) });
    }
  }

  return { findings, executedRules, skippedRules };
}
