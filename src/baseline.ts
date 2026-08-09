import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { Finding, ResolvedFinding, ScanReport } from "./types.js";

export interface BaselineFile {
  version: 1;
  createdAt: string;
  findings: Array<{ fingerprint: string; ruleId: string; path?: string }>;
}

export async function loadBaseline(root: string, path: string): Promise<BaselineFile | null> {
  const filename = join(root, path);
  try {
    const parsed = JSON.parse(await readFile(filename, "utf8")) as BaselineFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.findings)) throw new Error(`${path} is not a supported baseline file.`);
    return parsed;
  } catch (error: unknown) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export async function saveBaseline(root: string, path: string, findings: Finding[]): Promise<void> {
  const filename = join(root, path);
  await mkdir(dirname(filename), { recursive: true });
  const baseline: BaselineFile = {
    version: 1,
    createdAt: new Date().toISOString(),
    findings: findings.map((finding) => ({
      fingerprint: finding.fingerprint,
      ruleId: finding.ruleId,
      path: finding.location?.path,
    })),
  };
  await writeFile(filename, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

export function compareBaseline(findings: Finding[], baseline: BaselineFile | null): { findings: Finding[]; resolved: ResolvedFinding[] } {
  const previous = new Map((baseline?.findings ?? []).map((finding) => [finding.fingerprint, finding]));
  const current = new Set(findings.map((finding) => finding.fingerprint));
  const marked = findings.map((finding) => ({ ...finding, status: previous.has(finding.fingerprint) ? "existing" as const : "new" as const }));
  const resolved = [...previous.values()].filter((finding) => !current.has(finding.fingerprint));
  return { findings: marked, resolved };
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
