import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepository } from "../src/scanner.js";
import { loadConfig, severityFor } from "../src/config.js";

test("ignores configured rule identifiers", async () => {
  const root = await mkdtemp(join(tmpdir(), "openmaintainer-"));
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, "openmaintainer.yml"), "ignore:\n  - action-unpinned\n");
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "name: CI\npermissions:\n  contents: read\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");

  const report = await scanRepository(root);
  assert.equal(report.findings.some((finding) => finding.ruleId === "action-unpinned"), false);
});

test("applies shared policies before repository overrides", async () => {
  const root = await mkdtemp(join(tmpdir(), "openmaintainer-"));
  const policy = join(root, "organization.yml");
  await writeFile(policy, "version: 1\npreset: strict\nfailOn: warning\nrules:\n  action-unpinned:\n    severity: error\n");
  await writeFile(join(root, "openmaintainer.yml"), "version: 1\nfailOn: never\nrules:\n  action-unpinned:\n    severity: info\n");

  const config = await loadConfig(root, undefined, policy);
  assert.equal(config.preset, "strict");
  assert.equal(config.failOn, "never");
  assert.equal(severityFor("action-unpinned", "warning", config), "info");
  assert.equal(severityFor("permissions-implicit", "warning", config), "error");
});

test("rejects impossible suppression dates", async () => {
  const root = await mkdtemp(join(tmpdir(), "openmaintainer-"));
  await writeFile(join(root, "openmaintainer.yml"), "version: 1\nrules:\n  action-unpinned:\n    ignore:\n      - reason: temporary\n        expires: 2026-02-31\n");
  await assert.rejects(loadConfig(root), /real calendar date/);
});
