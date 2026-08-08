import type { ScanReport, Severity } from "./types.js";

const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function formatMarkdown(report: ScanReport): string {
  const findings = [...report.findings].sort(
    (left, right) => severityOrder[left.severity] - severityOrder[right.severity] || left.path.localeCompare(right.path),
  );
  const summary = findings.reduce<Record<Severity, number>>(
    (counts, finding) => ({ ...counts, [finding.severity]: counts[finding.severity] + 1 }),
    { error: 0, warning: 0, info: 0 },
  );
  const lines = [
    "# OpenMaintainer report",
    "",
    `Scanned \`${report.root}\` at ${report.scannedAt}.`,
    "",
    `**${summary.error} errors · ${summary.warning} warnings · ${summary.info} info**`,
    "",
  ];

  if (findings.length === 0) {
    lines.push("No findings from the enabled checks.");
  } else {
    for (const finding of findings) {
      const location = finding.line ? `${finding.path}:${finding.line}` : finding.path;
      lines.push(`## ${finding.severity.toUpperCase()} — ${finding.ruleId}`);
      lines.push(`**${location}** — ${finding.message}`);
      lines.push("");
      lines.push(`Remediation: ${finding.remediation}`);
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}
