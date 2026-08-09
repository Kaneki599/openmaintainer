import test from "node:test";
import assert from "node:assert/strict";
import { builtInRules } from "../src/index.js";
import type { Finding, ScanReport } from "../src/index.js";
import { readFile } from "node:fs/promises";
import { OPENMAINTAINER_VERSION } from "../src/version.js";

test("public API exposes a versioned report and stable rule identifiers", () => {
  const finding: Finding = {
    ruleId: "example",
    source: "openmaintainer",
    category: "maintenance",
    severity: "info",
    confidence: "high",
    title: "Example",
    message: "Example finding",
    remediation: "Review the workflow.",
    helpUri: "https://example.test/example",
    location: { path: ".github/workflows/ci.yml" },
    fingerprint: "example-fingerprint",
  };
  const report: ScanReport = {
    schemaVersion: 2,
    tool: { name: "openmaintainer", version: "0.2.0" },
    scannedAt: "2026-01-01T00:00:00.000Z",
    root: "/repository",
    durationMs: 1,
    policy: { preset: "maintainer", failOn: "error", baselineMode: "new" },
    coverage: { executedRules: ["example"], skippedRules: [] },
    summary: { errors: 0, warnings: 0, info: 1, newFindings: 1, existingFindings: 0, resolvedFindings: 0 },
    findings: [finding],
    resolved: [],
  };

  assert.equal(report.schemaVersion, 2);
  assert.equal(new Set(builtInRules.map((rule) => rule.meta.id)).size, builtInRules.length);
  assert.ok(builtInRules.length >= 15);
});

test("runtime and package versions stay synchronized", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(OPENMAINTAINER_VERSION, packageJson.version);
});
