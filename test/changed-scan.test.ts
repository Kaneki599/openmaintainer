import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepository } from "../src/scanner.js";

const execute = promisify(execFile);

test("changed mode reports only findings located in changed files", async () => {
  const root = await mkdtemp(join(tmpdir(), "openmaintainer-changed-"));
  const workflows = join(root, ".github", "workflows");
  await mkdir(workflows, { recursive: true });
  const safe = "name: CI\npermissions:\n  contents: read\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8\n";
  await writeFile(join(workflows, "changed.yml"), safe);
  await writeFile(join(workflows, "unchanged.yml"), safe.replace("actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8", "actions/checkout@v4"));
  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-qm", "initial"], { cwd: root });
  const { stdout: initialRevision } = await execute("git", ["rev-parse", "HEAD"], { cwd: root });
  await writeFile(join(workflows, "changed.yml"), safe.replace("actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8", "actions/checkout@v4"));
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-qm", "change workflow"], { cwd: root });

  const report = await scanRepository(root, { preset: "security", baseline: false, changedSince: initialRevision.trim() });
  assert.deepEqual(report.findings.map((finding) => finding.location?.path), [".github/workflows/changed.yml"]);
});
