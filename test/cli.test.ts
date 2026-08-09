import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";

test("init creates a versioned config and SHA-pinned workflow without overwriting", async () => {
  const root = await mkdtemp(join(tmpdir(), "openmaintainer-init-"));
  const originalWrite = process.stdout.write;
  const originalErrorWrite = process.stderr.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    assert.equal(await run(["init", root]), 0);
    assert.equal(await run(["init", root]), 2);
  } finally {
    process.stdout.write = originalWrite;
    process.stderr.write = originalErrorWrite;
  }
  assert.match(await readFile(join(root, "openmaintainer.yml"), "utf8"), /version: 1/);
  assert.match(await readFile(join(root, ".github/workflows/openmaintainer.yml"), "utf8"), /openmaintainer@[0-9a-f]{40}/);
});
