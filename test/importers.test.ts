import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregateReports } from "../src/importers.js";

test("imports and deduplicates third-party SARIF findings", async () => {
  const root = await mkdtemp(join(tmpdir(), "openmaintainer-import-"));
  const path = join(root, "tool.sarif");
  const result = { ruleId: "demo", level: "error", message: { text: "unsafe" }, locations: [{ physicalLocation: { artifactLocation: { uri: "src/a.ts" }, region: { startLine: 2 } } }] };
  await writeFile(path, JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver: { name: "Demo", rules: [{ id: "demo", shortDescription: { text: "Demo rule" } }] } }, results: [result, result] }] }));
  const report = await aggregateReports([path]);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0]?.source, "Demo");
  assert.equal(report.summary.errors, 1);
});

test("imports actionable OpenSSF Scorecard checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "openmaintainer-import-"));
  const path = join(root, "scorecard.json");
  await writeFile(path, JSON.stringify({ checks: [{ name: "Pinned-Dependencies", score: 3, reason: "dependencies are mutable" }, { name: "Maintained", score: 10 }] }));
  const report = await aggregateReports([path]);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0]?.ruleId, "scorecard-pinned-dependencies");
});
