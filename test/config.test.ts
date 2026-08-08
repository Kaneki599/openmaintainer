import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepository } from "../src/scanner.js";

test("ignores configured rule identifiers", async () => {
  const root = await mkdtemp(join(tmpdir(), "openmaintainer-"));
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, "openmaintainer.yml"), "ignore:\n  - action-unpinned\n");
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "name: CI\npermissions:\n  contents: read\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");

  const report = await scanRepository(root);
  assert.equal(report.findings.length, 0);
});
