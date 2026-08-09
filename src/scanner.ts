import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { compareBaseline, loadBaseline } from "./baseline.js";
import { loadConfig } from "./config.js";
import type { Preset } from "./config.js";
import type { Severity } from "./types.js";
import { runRules } from "./rules/registry.js";
import type { ScanReport } from "./types.js";
import { OPENMAINTAINER_VERSION } from "./version.js";
import { parseWorkflow } from "./workflow-model.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const WORKFLOW_DIRECTORY = ".github/workflows";

export interface ScanOptions {
  configPath?: string;
  policyPath?: string;
  baseline?: boolean;
  preset?: Preset;
  failOn?: Severity | "never";
  changedSince?: string;
}

export async function scanRepository(root: string, options: ScanOptions = {}): Promise<ScanReport> {
  const startedAt = performance.now();
  const loadedConfig = await loadConfig(root, options.configPath, options.policyPath);
  const config = { ...loadedConfig, preset: options.preset ?? loadedConfig.preset, failOn: options.failOn ?? loadedConfig.failOn };
  const workflows = await loadWorkflows(root);
  const result = await runRules({ root, workflows, config });
  const changedPaths = options.changedSince ? await listChangedPaths(root, options.changedSince) : null;
  const scopedFindings = changedPaths ? result.findings.filter((finding) => finding.location?.path && changedPaths.has(finding.location.path.replaceAll("\\", "/"))) : result.findings;
  const baseline = options.baseline === false ? null : await loadBaseline(root, config.baseline.file);
  const comparison = compareBaseline(scopedFindings, baseline);
  const summary = {
    errors: comparison.findings.filter((finding) => finding.severity === "error").length,
    warnings: comparison.findings.filter((finding) => finding.severity === "warning").length,
    info: comparison.findings.filter((finding) => finding.severity === "info").length,
    newFindings: comparison.findings.filter((finding) => finding.status === "new").length,
    existingFindings: comparison.findings.filter((finding) => finding.status === "existing").length,
    resolvedFindings: comparison.resolved.length,
  };

  return {
    schemaVersion: 2,
    tool: { name: "openmaintainer", version: OPENMAINTAINER_VERSION },
    scannedAt: new Date().toISOString(),
    root,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    policy: { preset: config.preset, failOn: config.failOn, baselineMode: config.baseline.mode, changedSince: options.changedSince },
    coverage: { executedRules: result.executedRules, skippedRules: result.skippedRules },
    summary,
    findings: comparison.findings,
    resolved: comparison.resolved,
  };
}

const execFileAsync = promisify(execFile);

async function listChangedPaths(root: string, reference: string): Promise<Set<string>> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", "--diff-filter=ACMRT", `${reference}...HEAD`, "--"], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
    return new Set(stdout.split(/\r?\n/).filter(Boolean).map((path) => path.replaceAll("\\", "/")));
  } catch (error: unknown) {
    const detail = typeof error === "object" && error !== null && "stderr" in error ? String((error as { stderr?: string }).stderr).trim() : "";
    throw new Error(`Could not determine files changed since ${reference}.${detail ? ` ${detail}` : ""}`);
  }
}

async function loadWorkflows(root: string) {
  const workflowRoot = join(root, WORKFLOW_DIRECTORY);
  try {
    const entries = await readdir(workflowRoot, { withFileTypes: true });
    const workflowFiles = entries.filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name)).sort((left, right) => left.name.localeCompare(right.name));
    return Promise.all(workflowFiles.map(async (entry) => {
      const filename = join(workflowRoot, entry.name);
      return parseWorkflow(relative(root, filename), await readFile(filename, "utf8"));
    }));
  } catch (error: unknown) {
    if (isMissingDirectory(error)) return [];
    throw error;
  }
}

function isMissingDirectory(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
