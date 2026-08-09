import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepository } from "../src/scanner.js";

test("reports repository adoption and package metadata gaps", async () => {
  const root = await mkdtemp(join(tmpdir(), "openmaintainer-health-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "sample" }));
  const report = await scanRepository(root, { preset: "maintainer", baseline: false });
  const ids = new Set(report.findings.map((finding) => finding.ruleId));
  assert.equal(ids.has("repository-readme-missing"), true);
  assert.equal(ids.has("package-metadata-incomplete"), true);
  assert.equal(ids.has("package-lock-missing"), true);
  assert.equal(ids.has("package-engines-missing"), true);
});

test("security preset excludes repository maintenance checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "openmaintainer-health-"));
  const report = await scanRepository(root, { preset: "security", baseline: false });
  assert.equal(report.findings.some((finding) => finding.category === "maintenance" || finding.category === "repository"), false);
  assert.equal(report.coverage.skippedRules.some((rule) => rule.ruleId === "repository-readme-missing"), true);
});
