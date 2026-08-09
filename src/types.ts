export type Severity = "error" | "warning" | "info";
export type Confidence = "high" | "medium" | "low";
export type FindingCategory =
  | "workflow-security"
  | "repository"
  | "release"
  | "supply-chain"
  | "maintenance";

export interface SourceLocation {
  path: string;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export interface Finding {
  ruleId: string;
  source: string;
  category: FindingCategory;
  severity: Severity;
  confidence: Confidence;
  title: string;
  message: string;
  remediation: string;
  helpUri: string;
  location?: SourceLocation;
  fingerprint: string;
  status?: "new" | "existing";
}

export interface RuleMetadata {
  id: string;
  title: string;
  description: string;
  category: FindingCategory;
  defaultSeverity: Severity;
  confidence: Confidence;
  helpUri: string;
  tags: string[];
}

export interface RuleContext {
  root: string;
  workflows: import("./workflow-model.js").WorkflowDocument[];
  config: import("./config.js").ResolvedConfig;
}

export interface Rule {
  meta: RuleMetadata;
  run(context: RuleContext): Promise<Finding[]> | Finding[];
}

export interface ScanCoverage {
  executedRules: string[];
  skippedRules: Array<{ ruleId: string; reason: string }>;
}

export interface ScanSummary {
  errors: number;
  warnings: number;
  info: number;
  newFindings: number;
  existingFindings: number;
  resolvedFindings: number;
}

export interface ResolvedFinding {
  fingerprint: string;
  ruleId: string;
  path?: string;
}

export interface ScanReport {
  schemaVersion: 2;
  tool: { name: "openmaintainer"; version: string };
  scannedAt: string;
  root: string;
  durationMs: number;
  policy: { preset: string; failOn: Severity | "never"; baselineMode: "all" | "new"; changedSince?: string };
  coverage: ScanCoverage;
  summary: ScanSummary;
  findings: Finding[];
  resolved: ResolvedFinding[];
}
