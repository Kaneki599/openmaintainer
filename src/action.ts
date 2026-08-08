import { appendFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatMarkdown } from "./reporters.js";
import { scanRepository } from "./scanner.js";

function input(name: string, fallback: string): string {
  return process.env[`INPUT_${name.replaceAll("-", "_").toUpperCase()}`]?.trim() || fallback;
}

async function setOutput(name: string, value: string): Promise<void> {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) await appendFile(outputFile, `${name}=${value}\n`, "utf8");
}

async function main(): Promise<void> {
  const root = resolve(input("target", "."));
  const format = input("format", "markdown");
  const output = input("output", "openmaintainer-report.md");
  const failOnError = input("fail-on-error", "true") !== "false";
  const report = await scanRepository(root);
  const body = format === "json" ? `${JSON.stringify(report, null, 2)}\n` : formatMarkdown(report);

  await writeFile(output, body, "utf8");
  await setOutput("report-path", output);
  await setOutput("error-count", String(report.findings.filter((finding) => finding.severity === "error").length));
  process.stdout.write(`OpenMaintainer wrote ${output} with ${report.findings.length} finding(s).\n`);

  if (failOnError && report.findings.some((finding) => finding.severity === "error")) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 2;
});
