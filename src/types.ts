export type Severity = "error" | "warning" | "info";

export interface Finding {
  ruleId: string;
  severity: Severity;
  message: string;
  path: string;
  line?: number;
  remediation: string;
}

export interface ScanReport {
  schemaVersion: 1;
  scannedAt: string;
  root: string;
  findings: Finding[];
}
