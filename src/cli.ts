#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { saveBaseline } from "./baseline.js";
import { formatReport, type OutputFormat } from "./reporters.js";
import { builtInRules } from "./rules/registry.js";
import { scanRepository, type ScanOptions } from "./scanner.js";
import type { ScanReport, Severity } from "./types.js";
import { OPENMAINTAINER_VERSION } from "./version.js";
import { aggregateReports } from "./importers.js";
import { analyzeGitHubOwner, formatGitHubPortfolioHtml } from "./github-portfolio.js";

interface ScanCliOptions extends ScanOptions {
  root: string;
  format: OutputFormat;
  output?: string;
  failOn?: Severity | "never";
}

function usage(): string {
  return `OpenMaintainer ${OPENMAINTAINER_VERSION}

Usage:
  openmaintainer scan [directory] [--format terminal|markdown|json|sarif|html] [--output file]
  openmaintainer init [directory]
  openmaintainer baseline create|check [directory]
  openmaintainer aggregate <report...> [--format terminal|markdown|json|sarif|html] [--output file]
  openmaintainer github org <owner> [--limit number] [--format json|html] [--output file]
  openmaintainer rules list
  openmaintainer rules explain <rule-id>
  openmaintainer doctor [directory]

Common scan options:
  --config <file>        Use an explicit configuration file
  --policy <file>        Apply a shared policy before repository configuration
  --preset <name>       starter, maintainer, security, or strict
  --fail-on <severity>  error, warning, info, or never
  --no-baseline         Ignore the stored baseline for this scan
  --changed <git-ref>   Report findings only in files changed since a Git ref`;
}

export async function run(args: string[]): Promise<number> {
  try {
    switch (args[0]) {
      case "scan": return runScan(parseScanArguments(args.slice(1)));
      case "init": return runInit(resolve(positional(args.slice(1))[0] ?? "."));
      case "baseline": return runBaseline(args.slice(1));
      case "aggregate": return runAggregate(args.slice(1));
      case "github": return runGitHub(args.slice(1));
      case "rules": return runRulesCommand(args.slice(1));
      case "doctor": return runDoctor(resolve(positional(args.slice(1))[0] ?? "."));
      case "--version":
      case "-v": process.stdout.write(`${OPENMAINTAINER_VERSION}\n`); return 0;
      case "--help":
      case "-h":
      case undefined: process.stdout.write(`${usage()}\n`); return 0;
      default: throw new Error(`Unknown command: ${args[0]}\n\n${usage()}`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

async function runGitHub(args: string[]): Promise<number> {
  if (args[0] !== "org" || !args[1]) throw new Error("Usage: openmaintainer github org <owner> [--limit number] [--format json|html] [--output file]");
  const owner = args[1];
  let limit = 100;
  let format: "json" | "html" = "json";
  let output: string | undefined;
  let includeArchived = false;
  let preset: ScanOptions["preset"] = "maintainer";
  for (let index = 2; index < args.length; index += 1) {
    const value = args[index]!;
    if (value === "--limit") {
      limit = Number(requiredValue(args, ++index, value));
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("--limit must be an integer between 1 and 500.");
    } else if (value === "--format") {
      const selected = requiredValue(args, ++index, value);
      if (selected !== "json" && selected !== "html") throw new Error("GitHub portfolio format must be json or html.");
      format = selected;
    } else if (value === "--output") output = requiredValue(args, ++index, value);
    else if (value === "--include-archived") includeArchived = true;
    else if (value === "--preset") preset = presetValue(requiredValue(args, ++index, value));
    else throw new Error(`Unknown option: ${value}`);
  }
  const report = await analyzeGitHubOwner(owner, { token: process.env.GITHUB_TOKEN, limit, includeArchived, scan: { preset } });
  const body = format === "html" ? formatGitHubPortfolioHtml(report) : `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    const filename = resolve(output);
    await mkdir(dirname(filename), { recursive: true });
    await writeFile(filename, body, "utf8");
  } else process.stdout.write(body);
  return 0;
}

async function runAggregate(args: string[]): Promise<number> {
  const paths: string[] = [];
  let format: OutputFormat = "terminal";
  let output: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    if (value === "--format") format = outputFormat(requiredValue(args, ++index, value));
    else if (value === "--output") output = requiredValue(args, ++index, value);
    else if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`);
    else paths.push(resolve(value));
  }
  if (paths.length === 0) throw new Error("aggregate requires at least one JSON or SARIF report.");
  const body = formatReport(await aggregateReports(paths), format);
  if (output) {
    const filename = resolve(output);
    await mkdir(dirname(filename), { recursive: true });
    await writeFile(filename, body, "utf8");
  } else process.stdout.write(body);
  return 0;
}

async function runScan(options: ScanCliOptions): Promise<number> {
  const report = await scanRepository(options.root, options);
  const body = formatReport(report, options.format);
  if (options.output) {
    const filename = resolve(options.output);
    await mkdir(dirname(filename), { recursive: true });
    await writeFile(filename, body, "utf8");
  } else {
    process.stdout.write(body);
  }
  return shouldFail(report, options.failOn) ? 1 : 0;
}

async function runInit(root: string): Promise<number> {
  const configPath = resolve(root, "openmaintainer.yml");
  const workflowPath = resolve(root, ".github/workflows/openmaintainer.yml");
  await mkdir(dirname(workflowPath), { recursive: true });
  await writeExclusive(configPath, `version: 1\npreset: maintainer\nfailOn: error\nbaseline:\n  file: .openmaintainer/baseline.json\n  mode: new\ngithub:\n  annotations: true\n  summary: true\n  pullRequestComment: false\n`);
  await writeExclusive(workflowPath, `name: OpenMaintainer\non:\n  pull_request:\n  push:\n    branches: [main]\npermissions:\n  contents: read\njobs:\n  scan:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0\n      - uses: Kaneki599/openmaintainer@v0\n`);
  process.stdout.write(`Created ${configPath}\nCreated ${workflowPath}\n`);
  return 0;
}

async function runBaseline(args: string[]): Promise<number> {
  const operation = args[0];
  const root = resolve(positional(args.slice(1))[0] ?? ".");
  if (operation === "check") return runScan({ root, format: "terminal" });
  if (operation !== "create") throw new Error("Usage: openmaintainer baseline create|check [directory]");
  const config = await loadConfig(root);
  const report = await scanRepository(root, { baseline: false });
  await saveBaseline(root, config.baseline.file, report.findings);
  process.stdout.write(`Stored ${report.findings.length} findings in ${resolve(root, config.baseline.file)}\n`);
  return 0;
}

function runRulesCommand(args: string[]): number {
  if (args[0] === "list") {
    for (const candidate of builtInRules) process.stdout.write(`${candidate.meta.id}\t${candidate.meta.defaultSeverity}\t${candidate.meta.title}\n`);
    return 0;
  }
  if (args[0] === "explain" && args[1]) {
    const candidate = builtInRules.find((rule) => rule.meta.id === args[1]);
    if (!candidate) throw new Error(`Unknown rule: ${args[1]}`);
    process.stdout.write(`${candidate.meta.title}\n\n${candidate.meta.description}\n\nSeverity: ${candidate.meta.defaultSeverity}\nConfidence: ${candidate.meta.confidence}\nDocumentation: ${candidate.meta.helpUri}\n`);
    return 0;
  }
  throw new Error("Usage: openmaintainer rules list | openmaintainer rules explain <rule-id>");
}

async function runDoctor(root: string): Promise<number> {
  const config = await loadConfig(root);
  const report = await scanRepository(root, { baseline: false });
  const lines = [
    `OpenMaintainer ${OPENMAINTAINER_VERSION}`,
    `Node ${process.versions.node}`,
    `Root ${root}`,
    `Preset ${config.preset}`,
    `Rules ${report.coverage.executedRules.length} enabled, ${report.coverage.skippedRules.length} skipped`,
    `Findings ${report.findings.length}`,
    ...config.warnings.map((warning) => `Warning: ${warning}`),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

function parseScanArguments(args: string[]): ScanCliOptions {
  const values = [...args];
  let root = ".";
  let format: OutputFormat = "terminal";
  let output: string | undefined;
  let configPath: string | undefined;
  let policyPath: string | undefined;
  let preset: ScanOptions["preset"];
  let failOn: Severity | "never" | undefined;
  let baseline = true;
  let changedSince: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--format") format = outputFormat(requiredValue(values, ++index, value));
    else if (value === "--output") output = requiredValue(values, ++index, value);
    else if (value === "--config") configPath = resolve(requiredValue(values, ++index, value));
    else if (value === "--policy") policyPath = resolve(requiredValue(values, ++index, value));
    else if (value === "--preset") preset = presetValue(requiredValue(values, ++index, value));
    else if (value === "--fail-on") failOn = failOnValue(requiredValue(values, ++index, value));
    else if (value === "--no-baseline") baseline = false;
    else if (value === "--changed") changedSince = requiredValue(values, ++index, value);
    else if (!value.startsWith("-")) root = value;
    else throw new Error(`Unknown option: ${value}`);
  }
  return { root: resolve(root), format, output, configPath, policyPath, preset, failOn, baseline, changedSince };
}

function shouldFail(report: ScanReport, override?: Severity | "never"): boolean {
  const threshold = override ?? report.policy.failOn;
  if (threshold === "never") return false;
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return report.findings.some((finding) => {
    if (report.policy.baselineMode === "new" && finding.status !== "new") return false;
    return rank[finding.severity] <= rank[threshold];
  });
}

function outputFormat(value: string): OutputFormat {
  if (!["terminal", "markdown", "json", "sarif", "html"].includes(value)) throw new Error(`Unsupported format: ${value}`);
  return value as OutputFormat;
}

function presetValue(value: string): ScanOptions["preset"] {
  if (!["starter", "maintainer", "security", "strict"].includes(value)) throw new Error(`Unsupported preset: ${value}`);
  return value as ScanOptions["preset"];
}

function failOnValue(value: string): Severity | "never" {
  if (!["error", "warning", "info", "never"].includes(value)) throw new Error(`Unsupported fail-on value: ${value}`);
  return value as Severity | "never";
}

function positional(args: string[]): string[] {
  return args.filter((value) => !value.startsWith("-"));
}

function requiredValue(values: string[], index: number, option: string): string {
  const value = values[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

async function writeExclusive(path: string, content: string): Promise<void> {
  try {
    await writeFile(path, content, { encoding: "utf8", flag: "wx" });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Refusing to overwrite existing file: ${path}`);
    }
    throw error;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  run(process.argv.slice(2)).then((code) => process.exitCode = code);
}
