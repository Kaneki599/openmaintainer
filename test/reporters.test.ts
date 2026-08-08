import test from "node:test";
import assert from "node:assert/strict";
import { formatMarkdown } from "../src/reporters.js";

test("formats findings with a severity summary and remediation", () => {
  const markdown = formatMarkdown({
    schemaVersion: 1,
    scannedAt: "2026-08-08T00:00:00.000Z",
    root: "/example",
    findings: [{ ruleId: "action-unpinned", severity: "warning", message: "Mutable action.", path: "ci.yml", line: 7, remediation: "Pin it." }],
  });

  assert.match(markdown, /0 errors · 1 warnings · 0 info/);
  assert.match(markdown, /ci.yml:7/);
  assert.match(markdown, /Remediation: Pin it\./);
});
