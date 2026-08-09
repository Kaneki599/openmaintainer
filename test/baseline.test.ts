import test from "node:test";
import assert from "node:assert/strict";
import { compareBaseline } from "../src/baseline.js";
import type { Finding } from "../src/types.js";

const finding: Finding = {
  ruleId: "action-unpinned",
  source: "openmaintainer",
  category: "workflow-security",
  severity: "warning",
  confidence: "high",
  title: "Unpinned action",
  message: "Mutable reference",
  remediation: "Pin it",
  helpUri: "https://example.test",
  location: { path: "ci.yml", startLine: 4 },
  fingerprint: "current",
};

test("marks existing and resolved baseline findings", () => {
  const comparison = compareBaseline([finding], {
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    findings: [
      { fingerprint: "current", ruleId: "action-unpinned", path: "ci.yml" },
      { fingerprint: "gone", ruleId: "permissions-write-all", path: "old.yml" },
    ],
  });
  assert.equal(comparison.findings[0]?.status, "existing");
  assert.deepEqual(comparison.resolved, [{ fingerprint: "gone", ruleId: "permissions-write-all", path: "old.yml" }]);
});
