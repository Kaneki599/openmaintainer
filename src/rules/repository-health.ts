import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Finding, FindingCategory, Rule, RuleMetadata, Severity } from "../types.js";

const HELP_ROOT = "https://github.com/Kaneki599/openmaintainer/blob/main/docs/rules.md";

export const repositoryRules: Rule[] = [
  anyFileRule("repository-readme-missing", "README is missing", "A repository landing page helps users understand and evaluate the project.", ["README.md", "README.rst", "README.txt", "README"], "warning", "repository", "Add a README with the problem, installation, a minimal example, and support expectations."),
  anyFileRule("repository-license-missing", "License is missing", "Without a license, users do not have clear permission to use or contribute to the project.", ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"], "warning", "repository", "Add an OSI-approved license and identify it in package metadata."),
  anyFileRule("security-policy-missing", "Security policy is missing", "A disclosure policy gives reporters a safe route for vulnerabilities.", ["SECURITY.md", ".github/SECURITY.md"], "warning", "repository", "Add SECURITY.md with supported versions and a private reporting channel."),
  anyFileRule("contributing-guide-missing", "Contribution guide is missing", "Contributors need a predictable development and review path.", ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"], "info", "maintenance", "Add setup, test, pull-request, and review instructions."),
  anyFileRule("codeowners-missing", "CODEOWNERS is missing", "Explicit ownership makes review routing and stewardship clearer.", ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"], "info", "maintenance", "Add a CODEOWNERS file for critical paths."),
  anyFileRule("pull-request-template-missing", "Pull request template is missing", "A lightweight template improves the consistency of proposed changes.", [".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md", ".github/PULL_REQUEST_TEMPLATE"], "info", "maintenance", "Add a pull request template covering rationale, tests, and compatibility."),
  anyFileRule("issue-templates-missing", "Issue templates are missing", "Structured issue intake reduces triage time.", [".github/ISSUE_TEMPLATE/config.yml", ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml"], "info", "maintenance", "Add issue forms for bugs and feature requests."),
  anyFileRule("dependency-updates-missing", "Automated dependency updates are not configured", "Regular dependency updates reduce exposure to stale or vulnerable packages.", [".github/dependabot.yml", ".renovaterc", ".renovaterc.json", "renovate.json"], "info", "supply-chain", "Configure Dependabot or Renovate with a reviewable update cadence."),
  fileRule("changelog-missing", "Changelog is missing", "Users need a concise record of notable changes and upgrade considerations.", "CHANGELOG.md", "info", "release", "Add a changelog and update it for user-visible releases."),
  fileRule("support-policy-missing", "Support policy is missing", "A support policy sets expectations about questions and maintenance.", "SUPPORT.md", "info", "maintenance", "Add SUPPORT.md describing supported channels and response expectations."),
  packageMetadataRule(),
  packageLockRule(),
];

function fileRule(id: string, title: string, description: string, path: string, severity: Severity, category: FindingCategory, remediation: string): Rule {
  return anyFileRule(id, title, description, [path], severity, category, remediation);
}

function anyFileRule(id: string, title: string, description: string, paths: string[], severity: Severity, category: FindingCategory, remediation: string): Rule {
  const metadata = meta(id, title, description, severity, category);
  return {
    meta: metadata,
    async run({ root }) {
      for (const path of paths) if (await exists(join(root, path))) return [];
      return [finding(metadata, paths[0]!, `${paths.join("|")}:missing`, description, remediation)];
    },
  };
}

function packageMetadataRule(): Rule {
  const metadata = meta("package-metadata-incomplete", "Package metadata is incomplete", "Published packages should expose repository, license, description, and issue tracker metadata.", "warning", "release");
  return {
    meta: metadata,
    async run({ root }) {
      const path = "package.json";
      let data: Record<string, unknown>;
      try { data = JSON.parse(await readFile(join(root, path), "utf8")) as Record<string, unknown>; }
      catch (error: unknown) { return isMissing(error) ? [] : [finding(metadata, path, "invalid-json", "package.json could not be parsed.", "Fix package.json syntax before publishing.")]; }
      const missing = ["description", "license", "repository", "bugs"].filter((key) => data[key] === undefined || data[key] === "");
      return missing.length === 0 ? [] : [finding(metadata, path, missing.join(","), `package.json is missing: ${missing.join(", ")}.`, "Add discoverability and support metadata before publishing the package.")];
    },
  };
}

function packageLockRule(): Rule {
  const metadata = meta("package-lock-missing", "JavaScript lockfile is missing", "Applications and CI jobs benefit from reproducible dependency resolution.", "warning", "supply-chain");
  return {
    meta: metadata,
    async run({ root }) {
      if (!await exists(join(root, "package.json"))) return [];
      for (const path of ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]) if (await exists(join(root, path))) return [];
      return [finding(metadata, "package.json", "lockfile:missing", metadata.description, "Commit the lockfile produced by the package manager used in CI.")];
    },
  };
}

function meta(id: string, title: string, description: string, severity: Severity, category: FindingCategory): RuleMetadata {
  return { id, title, description, category, defaultSeverity: severity, confidence: "high", helpUri: `${HELP_ROOT}#${id}`, tags: [category, "repository-health"] };
}

function finding(metadata: RuleMetadata, path: string, evidence: string, message: string, remediation: string): Finding {
  return {
    ruleId: metadata.id,
    source: "openmaintainer",
    category: metadata.category,
    severity: metadata.defaultSeverity,
    confidence: metadata.confidence,
    title: metadata.title,
    message,
    remediation,
    helpUri: metadata.helpUri,
    location: { path },
    fingerprint: createHash("sha256").update([metadata.id, path, evidence].join("\0")).digest("hex"),
  };
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch (error: unknown) { if (isMissing(error)) return false; throw error; }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
