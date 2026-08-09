import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Confidence, Finding, FindingCategory, ScanReport, Severity } from "./types.js";
import { OPENMAINTAINER_VERSION } from "./version.js";

interface SarifResult {
  ruleId?: string;
  level?: string;
  message?: { text?: string };
  helpUri?: string;
  locations?: Array<{ physicalLocation?: { artifactLocation?: { uri?: string }; region?: { startLine?: number; startColumn?: number; endLine?: number; endColumn?: number } } }>;
  partialFingerprints?: Record<string, string>;
}

export async function aggregateReports(paths: string[]): Promise<ScanReport> {
  const startedAt = performance.now();
  const findings: Finding[] = [];
  for (const path of paths) findings.push(...await importReport(path));
  const unique = [...new Map(findings.map((finding) => [`${finding.source}:${finding.fingerprint}`, finding])).values()];
  unique.sort((left, right) => `${left.location?.path ?? ""}:${left.ruleId}`.localeCompare(`${right.location?.path ?? ""}:${right.ruleId}`));
  return {
    schemaVersion: 2,
    tool: { name: "openmaintainer", version: OPENMAINTAINER_VERSION },
    scannedAt: new Date().toISOString(),
    root: "aggregated-reports",
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    policy: { preset: "aggregate", failOn: "never", baselineMode: "all" },
    coverage: { executedRules: [], skippedRules: [] },
    summary: summarize(unique),
    findings: unique,
    resolved: [],
  };
}

export async function importReport(path: string): Promise<Finding[]> {
  const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  if (raw.schemaVersion === 2 && Array.isArray(raw.findings)) return (raw as unknown as ScanReport).findings;
  if (raw.version === "2.1.0" && Array.isArray(raw.runs)) return importSarif(raw, basename(path));
  if (Array.isArray(raw.checks)) return importScorecard(raw, basename(path));
  throw new Error(`Unsupported report format: ${path}`);
}

function importSarif(raw: Record<string, unknown>, fallbackSource: string): Finding[] {
  const findings: Finding[] = [];
  for (const run of raw.runs as Array<Record<string, any>>) {
    const source = String(run.tool?.driver?.name ?? fallbackSource);
    const rules = new Map<string, Record<string, any>>((run.tool?.driver?.rules ?? []).map((rule: Record<string, any>) => [String(rule.id), rule]));
    for (const result of (run.results ?? []) as SarifResult[]) {
      const ruleId = result.ruleId ?? "external-finding";
      const rule = rules.get(ruleId);
      const physical = result.locations?.[0]?.physicalLocation;
      const path = physical?.artifactLocation?.uri;
      const message = result.message?.text ?? rule?.shortDescription?.text ?? "External analysis finding";
      const fingerprint = result.partialFingerprints?.openmaintainerFingerprint ?? result.partialFingerprints?.primaryLocationLineHash ?? hash([source, ruleId, path ?? "", message]);
      findings.push({
        ruleId,
        source,
        category: inferCategory(rule?.properties?.tags),
        severity: sarifSeverity(result.level),
        confidence: "medium",
        title: rule?.shortDescription?.text ?? ruleId,
        message,
        remediation: rule?.fullDescription?.text ?? "Review the originating tool documentation and address the reported condition.",
        helpUri: result.helpUri ?? rule?.helpUri ?? "https://sarifweb.azurewebsites.net/",
        location: path ? { path, ...physical?.region } : undefined,
        fingerprint,
      });
    }
  }
  return findings;
}

function importScorecard(raw: Record<string, unknown>, source: string): Finding[] {
  return (raw.checks as Array<Record<string, any>>).flatMap((check) => {
    const score = Number(check.score);
    if (!Number.isFinite(score) || score >= 8) return [];
    const name = String(check.name ?? "scorecard-check");
    const reason = String(check.reason ?? `Score ${score}/10`);
    return [{
      ruleId: `scorecard-${slug(name)}`,
      source: `OpenSSF Scorecard (${source})`,
      category: "supply-chain" as FindingCategory,
      severity: score < 4 ? "error" as Severity : "warning" as Severity,
      confidence: "high" as Confidence,
      title: `${name} score is ${score}/10`,
      message: reason,
      remediation: `Review the OpenSSF Scorecard guidance for ${name}.`,
      helpUri: "https://github.com/ossf/scorecard/blob/main/docs/checks.md",
      fingerprint: hash(["scorecard", name, reason]),
    }];
  });
}

function summarize(findings: Finding[]) {
  return {
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
    newFindings: findings.length,
    existingFindings: 0,
    resolvedFindings: 0,
  };
}

function sarifSeverity(level?: string): Severity {
  return level === "error" ? "error" : level === "note" || level === "none" ? "info" : "warning";
}

function inferCategory(tags: unknown): FindingCategory {
  const values = Array.isArray(tags) ? tags.map(String) : [];
  if (values.some((value) => /security|supply.chain/i.test(value))) return "supply-chain";
  return "repository";
}

function hash(parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
