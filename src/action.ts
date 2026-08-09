import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { formatMarkdown, formatReport, type OutputFormat } from "./reporters.js";
import { scanRepository } from "./scanner.js";
import type { Finding, ScanReport, Severity } from "./types.js";
import { loadConfig } from "./config.js";

const extension: Record<OutputFormat, string> = { terminal: "txt", markdown: "md", json: "json", sarif: "sarif", html: "html" };

function input(name: string, fallback = ""): string {
  return process.env[`INPUT_${name.replaceAll("-", "_").toUpperCase()}`]?.trim() || fallback;
}

async function setOutput(name: string, value: string): Promise<void> {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) await appendFile(outputFile, `${name}=${value}\n`, "utf8");
}

async function main(): Promise<void> {
  const root = resolve(input("target", "."));
  const formats = parseFormats(input("formats") || input("format", "markdown"));
  const legacyOutput = input("output", "openmaintainer-report.md");
  const reportDirectory = resolve(input("report-directory", ".openmaintainer/reports"));
  const configValue = input("config");
  const policyValue = input("policy");
  const changedSince = input("changed-since");
  const presetValue = input("preset");
  const configPath = configValue ? resolve(root, configValue) : undefined;
  const policyPath = policyValue ? resolve(root, policyValue) : undefined;
  const actionConfig = await loadConfig(root, configPath, policyPath);
  const failOnInput = input("fail-on");
  const legacyFailureInput = input("fail-on-error");
  const failOn = failOnValue(failOnInput || (legacyFailureInput ? legacyFailureInput === "false" ? "never" : "error" : actionConfig.failOn));
  const report = await scanRepository(root, {
    configPath,
    policyPath,
    preset: presetValue ? preset(presetValue) : undefined,
    failOn,
    changedSince: changedSince || undefined,
  });

  const paths = new Map<OutputFormat, string>();
  for (const format of formats) {
    const filename = formats.length === 1 ? resolve(legacyOutput) : join(reportDirectory, `openmaintainer-report.${extension[format]}`);
    await mkdir(dirname(filename), { recursive: true });
    await writeFile(filename, formatReport(report, format), "utf8");
    paths.set(format, filename);
  }

  if (booleanInput("annotations", actionConfig.github.annotations)) emitAnnotations(report.findings);
  if (booleanInput("summary", actionConfig.github.summary) && process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, formatMarkdown(report), "utf8");
  }
  if (booleanInput("pull-request-comment", actionConfig.github.pullRequestComment)) {
    await publishPullRequestComment(report, input("github-token"));
  }

  await setOutput("report-path", paths.values().next().value ?? "");
  await setOutput("markdown-path", paths.get("markdown") ?? "");
  await setOutput("json-path", paths.get("json") ?? "");
  await setOutput("sarif-path", paths.get("sarif") ?? "");
  await setOutput("html-path", paths.get("html") ?? "");
  await setOutput("error-count", String(report.summary.errors));
  await setOutput("warning-count", String(report.summary.warnings));
  await setOutput("new-count", String(report.summary.newFindings));
  await setOutput("resolved-count", String(report.summary.resolvedFindings));
  await setOutput("status", shouldFail(report, failOn) ? "failed" : "passed");
  process.stdout.write(`OpenMaintainer scanned ${report.root} with ${report.findings.length} finding(s).\n`);
  if (shouldFail(report, failOn)) process.exitCode = 1;
}

async function publishPullRequestComment(report: ScanReport, token: string): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token) throw new Error("github-token is required when pull-request-comment is enabled.");
  if (!eventPath || !repository) throw new Error("Pull request comments require the GitHub Actions event context.");
  const event = JSON.parse(await readFile(eventPath, "utf8")) as { pull_request?: { number?: number } };
  const issueNumber = event.pull_request?.number;
  if (!issueNumber) {
    process.stdout.write("::notice title=OpenMaintainer::No pull request is associated with this event; comment skipped.\n");
    return;
  }
  const marker = "<!-- openmaintainer-report -->";
  const body = `${marker}\n${formatMarkdown(report)}`.slice(0, 65_000);
  const base = `${process.env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${repository}/issues/${issueNumber}/comments`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
  const commentsResponse = await fetch(`${base}?per_page=100`, { headers });
  if (!commentsResponse.ok) throw new Error(`Could not list pull request comments: GitHub returned ${commentsResponse.status}.`);
  const comments = await commentsResponse.json() as Array<{ id: number; body?: string; user?: { type?: string } }>;
  const existing = comments.find((comment) => comment.user?.type === "Bot" && comment.body?.includes(marker));
  const response = await fetch(existing ? `${process.env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${repository}/issues/comments/${existing.id}` : base, {
    method: existing ? "PATCH" : "POST",
    headers,
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(`Could not publish pull request comment: GitHub returned ${response.status}.`);
}

function emitAnnotations(findings: Finding[]): void {
  const maximum = 50;
  for (const finding of findings.slice(0, maximum)) {
    const command = finding.severity === "info" ? "notice" : finding.severity;
    const properties = [
      finding.location?.path ? `file=${escapeProperty(finding.location.path)}` : "",
      finding.location?.startLine ? `line=${finding.location.startLine}` : "",
      finding.location?.startColumn ? `col=${finding.location.startColumn}` : "",
      `title=${escapeProperty(`OpenMaintainer: ${finding.ruleId}`)}`,
    ].filter(Boolean).join(",");
    process.stdout.write(`::${command} ${properties}::${escapeMessage(`${finding.message} ${finding.remediation}`)}\n`);
  }
  if (findings.length > maximum) process.stdout.write(`::notice title=OpenMaintainer::${findings.length - maximum} additional findings are available in the generated report.\n`);
}

function shouldFail(report: ScanReport, threshold: Severity | "never"): boolean {
  if (threshold === "never") return false;
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return report.findings.some((finding) => (report.policy.baselineMode !== "new" || finding.status === "new") && rank[finding.severity] <= rank[threshold]);
}

function parseFormats(value: string): OutputFormat[] {
  const formats = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  for (const format of formats) if (!["terminal", "markdown", "json", "sarif", "html"].includes(format)) throw new Error(`Unsupported report format: ${format}`);
  return formats as OutputFormat[];
}

function failOnValue(value: string): Severity | "never" {
  if (!["error", "warning", "info", "never"].includes(value)) throw new Error(`Unsupported fail-on value: ${value}`);
  return value as Severity | "never";
}

function preset(value: string): "starter" | "maintainer" | "security" | "strict" {
  if (!["starter", "maintainer", "security", "strict"].includes(value)) throw new Error(`Unsupported preset: ${value}`);
  return value as "starter" | "maintainer" | "security" | "strict";
}

function booleanInput(name: string, fallback: boolean): boolean {
  const value = input(name);
  if (!value) return fallback;
  if (value !== "true" && value !== "false") throw new Error(`${name} must be true or false.`);
  return value === "true";
}

function escapeMessage(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeProperty(value: string): string {
  return escapeMessage(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 2;
});
