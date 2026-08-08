import test from "node:test";
import assert from "node:assert/strict";
import { checkWorkflowSecurity } from "../src/rules/workflow-security.js";

test("reports mutable actions, broad permissions and pull_request_target", () => {
  const findings = checkWorkflowSecurity(
    ".github/workflows/ci.yml",
    `name: CI
on:
  pull_request_target:
permissions: write-all
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`,
  );

  assert.deepEqual(
    findings.map((finding) => finding.ruleId).sort(),
    ["action-unpinned", "permissions-write-all", "unsafe-pull-request-target"],
  );
});

test("accepts a SHA-pinned action and restricted permissions", () => {
  const findings = checkWorkflowSecurity(
    ".github/workflows/ci.yml",
    `name: CI
on: [push]
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
`,
  );

  assert.equal(findings.length, 0);
});

test("flags privileged workflow_run secrets separately from the trigger warning", () => {
  const findings = checkWorkflowSecurity(
    ".github/workflows/release.yml",
    `name: Release
on:
  workflow_run:
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: deploy --token "\${{ secrets.DEPLOY_TOKEN }}"
`,
  );

  assert.deepEqual(
    findings.map((finding) => finding.ruleId).sort(),
    ["secrets-in-privileged-workflow", "unsafe-workflow-run"],
  );
});
