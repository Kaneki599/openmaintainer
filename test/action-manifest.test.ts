import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";

test("action manifest is valid YAML and points to the bundled entry point", async () => {
  const source = await readFile(new URL("../action.yml", import.meta.url), "utf8");
  const document = parseDocument(source);
  assert.equal(document.errors.length, 0);
  const manifest = document.toJS() as { runs: { using: string; main: string }; branding: { icon: string; color: string } };
  assert.deepEqual(manifest.runs, { using: "node24", main: "dist/action.cjs" });
  assert.deepEqual(manifest.branding, { icon: "shield", color: "purple" });
});
