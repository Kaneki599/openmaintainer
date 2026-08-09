import type { Finding, ScanReport, Severity } from "./types.js";

export type OutputFormat = "terminal" | "markdown" | "json" | "sarif" | "html";

const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function formatReport(report: ScanReport, format: OutputFormat): string {
  switch (format) {
    case "terminal": return formatTerminal(report);
    case "markdown": return formatMarkdown(report);
    case "json": return `${JSON.stringify(report, null, 2)}\n`;
    case "sarif": return `${JSON.stringify(formatSarif(report), null, 2)}\n`;
    case "html": return formatHtml(report);
  }
}

export function formatTerminal(report: ScanReport, color = process.stdout.isTTY): string {
  const paint = (code: number, value: string) => color ? `\u001b[${code}m${value}\u001b[0m` : value;
  const lines = [
    paint(1, "OpenMaintainer"),
    `${report.summary.errors} errors · ${report.summary.warnings} warnings · ${report.summary.info} info`,
    `${report.summary.newFindings} new · ${report.summary.existingFindings} existing · ${report.summary.resolvedFindings} resolved`,
    `${report.coverage.executedRules.length} rules executed in ${report.durationMs} ms`,
    "",
  ];
  for (const finding of sortedFindings(report.findings)) {
    const code = finding.severity === "error" ? 31 : finding.severity === "warning" ? 33 : 36;
    lines.push(`${paint(code, finding.severity.toUpperCase())} ${finding.ruleId} ${formatLocation(finding)}`);
    lines.push(`  ${finding.message}`);
    lines.push(`  Fix: ${finding.remediation}`);
    lines.push("");
  }
  if (report.findings.length === 0) lines.push(paint(32, "No findings from the enabled checks."));
  return `${lines.join("\n")}\n`;
}

export function formatMarkdown(report: ScanReport): string {
  const lines = [
    "# OpenMaintainer report",
    "",
    `Scanned \`${report.root}\` at ${report.scannedAt} in ${report.durationMs} ms.`,
    "",
    `**${report.summary.errors} errors · ${report.summary.warnings} warnings · ${report.summary.info} info**`,
    "",
    `Baseline: ${report.summary.newFindings} new · ${report.summary.existingFindings} existing · ${report.summary.resolvedFindings} resolved`,
    "",
    `Coverage: ${report.coverage.executedRules.length} rules executed · ${report.coverage.skippedRules.length} skipped`,
    "",
  ];
  if (report.findings.length === 0) lines.push("No findings from the enabled checks.");
  for (const finding of sortedFindings(report.findings)) {
    lines.push(`## ${finding.severity.toUpperCase()} — ${finding.ruleId} (${finding.status ?? "new"})`);
    lines.push(`**${formatLocation(finding)}** — ${finding.message}`);
    lines.push("");
    lines.push(`Remediation: ${finding.remediation}`);
    lines.push("");
    lines.push(`[Rule documentation](${finding.helpUri})`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function formatSarif(report: ScanReport): Record<string, unknown> {
  const rules = [...new Map(report.findings.map((finding) => [finding.ruleId, finding])).values()].map((finding) => ({
    id: finding.ruleId,
    name: finding.ruleId.replaceAll("-", "_"),
    shortDescription: { text: finding.title },
    fullDescription: { text: finding.message },
    helpUri: finding.helpUri,
    defaultConfiguration: { level: sarifLevel(finding.severity) },
    properties: { tags: [finding.category, finding.confidence] },
  }));
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "OpenMaintainer", version: report.tool.version, informationUri: "https://github.com/Kaneki599/openmaintainer", rules } },
      automationDetails: { id: "openmaintainer/" },
      results: report.findings.map((finding) => ({
        ruleId: finding.ruleId,
        level: sarifLevel(finding.severity),
        message: { text: `${finding.message} ${finding.remediation}` },
        locations: finding.location ? [{ physicalLocation: {
          artifactLocation: { uri: finding.location.path.replaceAll("\\", "/"), uriBaseId: "%SRCROOT%" },
          region: {
            startLine: finding.location.startLine ?? 1,
            startColumn: finding.location.startColumn ?? 1,
            endLine: finding.location.endLine,
            endColumn: finding.location.endColumn,
          },
        } }] : undefined,
        partialFingerprints: { "openmaintainer/v1": finding.fingerprint },
        properties: { status: finding.status, confidence: finding.confidence, category: finding.category },
      })),
    }],
  };
}

export function formatHtml(report: ScanReport): string {
  const rows = sortedFindings(report.findings).map((finding) => `<tr data-severity="${finding.severity}"><td><span class="pill ${finding.severity}">${finding.severity}</span></td><td><strong>${escapeHtml(finding.title)}</strong><br><code>${escapeHtml(finding.ruleId)}</code></td><td><code>${escapeHtml(formatLocation(finding))}</code></td><td>${escapeHtml(finding.message)}<br><span class="fix">${escapeHtml(finding.remediation)}</span></td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenMaintainer report</title>
<style>:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#08111f;color:#e2e8f0}body{margin:0;padding:32px}.shell{max-width:1200px;margin:auto}.hero{padding:28px;border-radius:24px;background:linear-gradient(135deg,#172554,#312e81);box-shadow:0 18px 60px #020617}.metrics{display:flex;gap:12px;flex-wrap:wrap}.metric{padding:12px 16px;border-radius:14px;background:#0f172acc}.toolbar{margin:22px 0;display:flex;gap:8px}.toolbar button{color:#e2e8f0;background:#1e293b;border:0;border-radius:10px;padding:10px 14px;cursor:pointer}table{width:100%;border-collapse:collapse;background:#0f172a;border-radius:18px;overflow:hidden}th,td{text-align:left;padding:14px;border-bottom:1px solid #243247;vertical-align:top}.pill{padding:4px 8px;border-radius:999px;font-weight:800}.error{background:#7f1d1d}.warning{background:#78350f}.info{background:#164e63}.fix{color:#93c5fd}code{color:#c4b5fd}@media(max-width:800px){body{padding:14px}table{display:block;overflow:auto}}</style></head>
<body><main class="shell"><section class="hero"><h1>OpenMaintainer report</h1><p>${escapeHtml(report.root)} · ${escapeHtml(report.scannedAt)}</p><div class="metrics"><span class="metric">${report.summary.errors} errors</span><span class="metric">${report.summary.warnings} warnings</span><span class="metric">${report.summary.info} info</span><span class="metric">${report.summary.newFindings} new</span><span class="metric">${report.summary.resolvedFindings} resolved</span></div></section>
<nav class="toolbar" aria-label="Finding filters"><button data-filter="all">All</button><button data-filter="error">Errors</button><button data-filter="warning">Warnings</button><button data-filter="info">Info</button></nav>
<table><thead><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Finding and remediation</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No findings from the enabled checks.</td></tr>'}</tbody></table></main>
<script>for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{const filter=button.dataset.filter;for(const row of document.querySelectorAll('tbody tr[data-severity]'))row.hidden=filter!=='all'&&row.dataset.severity!==filter})</script></body></html>\n`;
}

function sortedFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]
    || (left.location?.path ?? "").localeCompare(right.location?.path ?? "")
    || (left.location?.startLine ?? 0) - (right.location?.startLine ?? 0));
}

function formatLocation(finding: Finding): string {
  if (!finding.location) return "repository";
  return `${finding.location.path}${finding.location.startLine ? `:${finding.location.startLine}${finding.location.startColumn ? `:${finding.location.startColumn}` : ""}` : ""}`;
}

function sarifLevel(severity: Severity): "error" | "warning" | "note" {
  return severity === "info" ? "note" : severity;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
