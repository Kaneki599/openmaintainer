import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkflow } from "../src/workflow-model.js";

test("indexes YAML pointers with exact one-based locations", () => {
  const workflow = parseWorkflow(".github/workflows/ci.yml", "name: CI\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v5\n");
  const uses = workflow.findByPointer("/jobs/test/steps/0/uses");
  assert.equal(uses?.value, "actions/checkout@v5");
  assert.equal(uses?.location.startLine, 5);
  assert.equal(uses?.location.startColumn, 15);
});

test("reports invalid YAML without executing semantic rules", () => {
  const workflow = parseWorkflow("broken.yml", "jobs:\n  test: [\n");
  assert.equal(workflow.data, null);
  assert.ok(workflow.errors.length > 0);
  assert.equal(workflow.errors[0]?.location.path, "broken.yml");
});
