#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatMarkdown } from "./reporters.js";
import { scanRepository } from "./scanner.js";

type OutputFormat = "json" | "markdown";

function usage(): string {
  return `Usage: openmaintainer scan [directory] [--format json|markdown] [--output file]

OpenMaintainer reads a local repository and reports without modifying it.`;
}

function parseArguments(args: string[]): { root: string; format: OutputFormat; output?: string } {
  if (args[0] !== "scan") throw new Error(usage());
  let root = ".";
  let format: OutputFormat = "markdown";
  let output: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--format") {
      const requested = args[++index];
      if (requested !== "json" && requested !== "markdown") throw new Error("--format must be json or markdown.");
      format = requested;
    } else if (value === "--output") {
      output = args[++index];
      if (!output) throw new Error("--output requires a file path.");
    } else if (!value.startsWith("-")) {
      root = value;
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }
  return { root: resolve(root), format, output };
}

export async function run(args: string[]): Promise<number> {
  try {
    const options = parseArguments(args);
    const report = await scanRepository(options.root);
    const body = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : formatMarkdown(report);
    if (options.output) await writeFile(options.output, body, "utf8");
    else process.stdout.write(body);
    return report.findings.some((finding) => finding.severity === "error") ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then((code) => process.exitCode = code);
}
