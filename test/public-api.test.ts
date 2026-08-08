import test from "node:test";
import assert from "node:assert/strict";
import type { Finding, ScanReport } from "../src/index.js";

test("public report types describe a versioned report", () => {
  const finding: Finding = {
    ruleId: "example",
    severity: "info",
    message: "Example finding",
    path: ".github/workflows/ci.yml",
    remediation: "Review the workflow.",
  };
  const report: ScanReport = {
    schemaVersion: 1,
    scannedAt: "2026-01-01T00:00:00.000Z",
    root: "/repository",
    findings: [finding],
  };

  assert.equal(report.findings[0]?.ruleId, "example");
});
