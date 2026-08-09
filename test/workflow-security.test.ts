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
    ["action-unpinned", "checkout-persists-credentials", "permissions-write-all", "unsafe-pull-request-target"],
  );
});

test("detects expression injection and self-hosted pull-request execution", () => {
  const findings = checkWorkflowSecurity(
    ".github/workflows/review.yml",
    `name: Review
on: [pull_request]
permissions:
  contents: read
jobs:
  review:
    runs-on: [self-hosted, linux]
    steps:
      - run: echo "\${{ github.event.pull_request.title }}"
`,
  );
  assert.deepEqual(findings.map((finding) => finding.ruleId).sort(), ["expression-injection", "self-hosted-untrusted"]);
  assert.equal(findings[0]?.location?.startLine, 9);
});

test("detects privileged artifact, OIDC, untrusted ref and cache use", () => {
  const findings = checkWorkflowSecurity(
    ".github/workflows/follow-up.yml",
    `name: Follow-up
on:
  workflow_run:
permissions:
  contents: read
  id-token: write
jobs:
  inspect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v5
      - uses: actions/checkout@v5
        with:
          ref: "\${{ github.event.pull_request.head.sha }}"
          persist-credentials: false
      - uses: actions/cache@v4
        with:
          key: "review-\${{ github.head_ref }}"
`,
  );
  const ids = findings.map((finding) => finding.ruleId);
  for (const expected of ["unsafe-workflow-run", "privileged-oidc", "workflow-artifact-trust", "untrusted-checkout-ref", "cache-key-untrusted"]) {
    assert.ok(ids.includes(expected), `missing ${expected}`);
  }
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
