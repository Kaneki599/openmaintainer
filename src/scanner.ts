import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { checkWorkflowSecurity } from "./rules/workflow-security.js";
import type { ScanReport } from "./types.js";

const WORKFLOW_DIRECTORY = ".github/workflows";

export async function scanRepository(root: string): Promise<ScanReport> {
  const workflowRoot = join(root, WORKFLOW_DIRECTORY);
  const findings = [];

  try {
    const entries = await readdir(workflowRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
      const filename = join(workflowRoot, entry.name);
      const source = await readFile(filename, "utf8");
      findings.push(...checkWorkflowSecurity(relative(root, filename), source));
    }
  } catch (error: unknown) {
    if (isMissingDirectory(error)) {
      // Repositories without GitHub Actions have nothing to scan yet.
    } else {
      throw error;
    }
  }

  return { schemaVersion: 1, scannedAt: new Date().toISOString(), root, findings };
}

function isMissingDirectory(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
