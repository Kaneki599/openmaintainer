import test from "node:test";
import assert from "node:assert/strict";
import { formatHtml, formatMarkdown, formatSarif, formatTerminal } from "../src/reporters.js";

test("formats findings with a severity summary and remediation", () => {
  const markdown = formatMarkdown({
    schemaVersion: 2,
    tool: { name: "openmaintainer", version: "0.2.0" },
    scannedAt: "2026-08-08T00:00:00.000Z",
    root: "/example",
    durationMs: 12,
    policy: { preset: "maintainer", failOn: "error", baselineMode: "new" },
    coverage: { executedRules: ["action-unpinned"], skippedRules: [] },
    summary: { errors: 0, warnings: 1, info: 0, newFindings: 1, existingFindings: 0, resolvedFindings: 0 },
    findings: [{ ruleId: "action-unpinned", source: "openmaintainer", category: "workflow-security", severity: "warning", confidence: "high", title: "Mutable action", message: "Mutable action.", location: { path: "ci.yml", startLine: 7 }, remediation: "Pin it.", helpUri: "https://example.test/rule", fingerprint: "abc", status: "new" }],
    resolved: [],
  });

  assert.match(markdown, /0 errors · 1 warnings · 0 info/);
  assert.match(markdown, /ci.yml:7/);
  assert.match(markdown, /Remediation: Pin it\./);
  assert.match(markdown, /1 new · 0 existing · 0 resolved/);
});

test("emits SARIF locations, fingerprints and escaped standalone HTML", () => {
  const report = {
    schemaVersion: 2 as const,
    tool: { name: "openmaintainer" as const, version: "0.2.0" },
    scannedAt: "2026-08-08T00:00:00.000Z",
    root: "<repository>", durationMs: 1,
    policy: { preset: "maintainer", failOn: "error" as const, baselineMode: "new" as const },
    coverage: { executedRules: ["demo"], skippedRules: [] },
    summary: { errors: 1, warnings: 0, info: 0, newFindings: 1, existingFindings: 0, resolvedFindings: 0 },
    findings: [{ ruleId: "demo", source: "openmaintainer", category: "repository" as const, severity: "error" as const, confidence: "high" as const, title: "Unsafe <title>", message: "Unsafe <value>", remediation: "Fix it.", helpUri: "https://example.test", location: { path: "src/a.ts", startLine: 3, startColumn: 2 }, fingerprint: "fingerprint" }],
    resolved: [],
  };
  const sarif = formatSarif(report) as any;
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine, 3);
  assert.equal(sarif.runs[0].results[0].partialFingerprints["openmaintainer/v1"], "fingerprint");
  assert.match(formatHtml(report), /Unsafe &lt;value&gt;/);
  assert.doesNotMatch(formatHtml(report), /Unsafe <value>/);
  assert.match(formatTerminal(report, false), /ERROR demo src\/a.ts:3:2/);
});
