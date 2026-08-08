import { parseDocument } from "yaml";
import type { Finding } from "../types.js";

const SHA_PIN = /^[a-f0-9]{40}$/i;

function lineOf(source: string, match: RegExp): number | undefined {
  const index = source.search(match);
  return index < 0 ? undefined : source.slice(0, index).split("\n").length;
}

function finding(
  ruleId: string,
  severity: Finding["severity"],
  message: string,
  path: string,
  remediation: string,
  line?: number,
): Finding {
  return { ruleId, severity, message, path, line, remediation };
}

/** Check a GitHub Actions workflow without changing it. */
export function checkWorkflowSecurity(path: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const document = parseDocument(source);

  if (document.errors.length > 0) {
    findings.push(
      finding(
        "workflow-invalid-yaml",
        "error",
        "The workflow is not valid YAML.",
        path,
        "Fix the YAML syntax before relying on this workflow.",
      ),
    );
    return findings;
  }

  const usesPattern = /^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm;
  for (const match of source.matchAll(usesPattern)) {
    const reference = match[1];
    const line = lineOf(source, new RegExp(`^\\s*(?:-\\s*)?uses:\\s*${escapeRegExp(reference)}`, "m"));
    if (
      reference.startsWith("./") ||
      reference.startsWith("docker://") ||
      !reference.includes("@")
    ) {
      continue;
    }
    const revision = reference.slice(reference.lastIndexOf("@") + 1);
    if (!SHA_PIN.test(revision)) {
      findings.push(
        finding(
          "action-unpinned",
          "warning",
          `Action '${reference}' is pinned to a mutable tag or branch.`,
          path,
          "Pin third-party actions to a full commit SHA and document the version in a comment.",
          line,
        ),
      );
    }
  }

  if (/^\s*pull_request_target\s*:/m.test(source)) {
    findings.push(
      finding(
        "unsafe-pull-request-target",
        "warning",
        "'pull_request_target' runs with the base repository context.",
        path,
        "Avoid checking out or executing pull-request code in this workflow; prefer pull_request where possible.",
        lineOf(source, /^\s*pull_request_target\s*:/m),
      ),
    );
  }

  if (/^\s*permissions:\s*write-all\s*$/m.test(source)) {
    findings.push(
      finding(
        "permissions-write-all",
        "error",
        "Workflow grants write-all permissions to GITHUB_TOKEN.",
        path,
        "Declare only the permissions required by the jobs that need them.",
        lineOf(source, /^\s*permissions:\s*write-all\s*$/m),
      ),
    );
  }

  if (!/^\s*permissions\s*:/m.test(source)) {
    findings.push(
      finding(
        "permissions-implicit",
        "info",
        "Workflow does not explicitly restrict GITHUB_TOKEN permissions.",
        path,
        "Add a top-level permissions block using the least privileges required.",
      ),
    );
  }

  return findings;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
