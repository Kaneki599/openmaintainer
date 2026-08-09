import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import type { FindingCategory, Severity } from "./types.js";

export type Preset = "starter" | "maintainer" | "security" | "strict";

export interface RuleSuppression {
  path?: string;
  reason: string;
  expires?: string;
}

export interface RuleOverride {
  enabled?: boolean;
  severity?: Severity;
  ignore?: RuleSuppression[];
}

export interface OpenMaintainerConfigFile {
  version?: 1;
  extends?: string;
  preset?: Preset;
  failOn?: Severity | "never";
  baseline?: { file?: string; mode?: "all" | "new" };
  rules?: Record<string, RuleOverride>;
  github?: { annotations?: boolean; summary?: boolean; pullRequestComment?: boolean };
  ignore?: string[];
}

const STARTER_RULES = new Set([
  "workflow-invalid-yaml",
  "action-unpinned",
  "permissions-write-all",
  "unsafe-pull-request-target",
  "expression-injection",
  "self-hosted-untrusted",
  "repository-readme-missing",
  "repository-license-missing",
  "security-policy-missing",
]);

export interface ResolvedConfig {
  version: 1;
  preset: Preset;
  failOn: Severity | "never";
  baseline: { file: string; mode: "all" | "new" };
  rules: Record<string, RuleOverride>;
  github: { annotations: boolean; summary: boolean; pullRequestComment: boolean };
  legacyIgnoredRules: Set<string>;
  warnings: string[];
}

export async function loadConfig(root: string, explicitPath?: string, policyPath?: string): Promise<ResolvedConfig> {
  const filename = explicitPath ?? join(root, "openmaintainer.yml");
  try {
    const local = await loadConfigFile(filename, new Set());
    const policy = policyPath ? await loadConfigFile(resolve(policyPath), new Set()) : {};
    return resolveConfig(mergeConfigs(policy, local));
  } catch (error: unknown) {
    if (isMissingFile(error) && !explicitPath) {
      const policy = policyPath ? await loadConfigFile(resolve(policyPath), new Set()) : {};
      return resolveConfig(policy);
    }
    throw error;
  }
}

async function loadConfigFile(filename: string, chain: Set<string>): Promise<OpenMaintainerConfigFile> {
  const absolute = resolve(filename);
  if (chain.has(absolute)) throw new Error(`Circular configuration inheritance detected at ${absolute}.`);
  const nextChain = new Set(chain).add(absolute);
  const source = await readFile(absolute, "utf8");
  const document = parseDocument(source);
  if (document.errors.length > 0) throw new Error(`Invalid ${absolute}: ${document.errors[0]?.message}`);
  const current = validateConfig(document.toJS(), absolute);
  if (!current.extends) return current;
  const parentPath = isAbsolute(current.extends) ? current.extends : join(dirname(absolute), current.extends);
  return mergeConfigs(await loadConfigFile(parentPath, nextChain), current);
}

function mergeConfigs(base: OpenMaintainerConfigFile, override: OpenMaintainerConfigFile): OpenMaintainerConfigFile {
  const rules: Record<string, RuleOverride> = { ...base.rules };
  for (const [ruleId, ruleOverride] of Object.entries(override.rules ?? {})) {
    rules[ruleId] = { ...base.rules?.[ruleId], ...ruleOverride };
  }
  return {
    ...base,
    ...override,
    baseline: { ...base.baseline, ...override.baseline },
    github: { ...base.github, ...override.github },
    rules,
    ignore: [...(base.ignore ?? []), ...(override.ignore ?? [])],
  };
}

export function resolveConfig(config: OpenMaintainerConfigFile): ResolvedConfig {
  const warnings: string[] = [];
  if (config.ignore?.length) warnings.push("Top-level 'ignore' is deprecated; migrate suppressions into rules.<id>.ignore.");
  return {
    version: 1,
    preset: config.preset ?? "maintainer",
    failOn: config.failOn ?? "error",
    baseline: { file: config.baseline?.file ?? ".openmaintainer/baseline.json", mode: config.baseline?.mode ?? "new" },
    rules: config.rules ?? {},
    github: {
      annotations: config.github?.annotations ?? true,
      summary: config.github?.summary ?? true,
      pullRequestComment: config.github?.pullRequestComment ?? false,
    },
    legacyIgnoredRules: new Set(config.ignore ?? []),
    warnings,
  };
}

export function isRuleEnabled(ruleId: string, config: ResolvedConfig, category?: FindingCategory): boolean {
  if (config.legacyIgnoredRules.has(ruleId) || config.rules[ruleId]?.enabled === false) return false;
  if (config.rules[ruleId]?.enabled === true) return true;
  if (config.preset === "starter") return STARTER_RULES.has(ruleId);
  if (config.preset === "security") return category === "workflow-security" || category === "supply-chain";
  return true;
}

export function severityFor(ruleId: string, fallback: Severity, config: ResolvedConfig): Severity {
  const explicit = config.rules[ruleId]?.severity;
  if (explicit) return explicit;
  if (config.preset === "strict" && fallback === "warning") return "error";
  return fallback;
}

export function isSuppressed(ruleId: string, path: string | undefined, config: ResolvedConfig, now = new Date()): boolean {
  return (config.rules[ruleId]?.ignore ?? []).some((suppression) => {
    if (suppression.path && suppression.path !== path) return false;
    return !suppression.expires || new Date(`${suppression.expires}T23:59:59.999Z`) >= now;
  });
}

function validateConfig(value: unknown, filename: string): OpenMaintainerConfigFile {
  if (!isRecord(value)) throw new Error(`${filename} must contain a YAML mapping.`);
  if (value.version !== undefined && value.version !== 1) throw new Error(`${filename} version must be 1.`);
  if (value.extends !== undefined && typeof value.extends !== "string") throw new Error(`${filename} extends must be a file path.`);
  if (value.preset !== undefined && !["starter", "maintainer", "security", "strict"].includes(String(value.preset))) {
    throw new Error(`${filename} preset must be starter, maintainer, security, or strict.`);
  }
  if (value.failOn !== undefined && !["error", "warning", "info", "never"].includes(String(value.failOn))) {
    throw new Error(`${filename} failOn must be error, warning, info, or never.`);
  }
  if (value.ignore !== undefined && (!Array.isArray(value.ignore) || !value.ignore.every((item) => typeof item === "string"))) {
    throw new Error(`${filename} ignore must be a list of rule identifiers.`);
  }
  if (value.rules !== undefined && !isRecord(value.rules)) throw new Error(`${filename} rules must be a mapping.`);

  const config = value as OpenMaintainerConfigFile;
  for (const [ruleId, override] of Object.entries(config.rules ?? {})) {
    if (!isRecord(override)) throw new Error(`${filename} rules.${ruleId} must be a mapping.`);
    if (override.severity !== undefined && !["error", "warning", "info"].includes(String(override.severity))) {
      throw new Error(`${filename} rules.${ruleId}.severity is invalid.`);
    }
    if (override.ignore !== undefined) {
      if (!Array.isArray(override.ignore)) throw new Error(`${filename} rules.${ruleId}.ignore must be a list.`);
      for (const suppression of override.ignore) {
        if (!isRecord(suppression) || typeof suppression.reason !== "string" || suppression.reason.trim() === "") {
          throw new Error(`${filename} rules.${ruleId}.ignore entries require a reason.`);
        }
        if (suppression.expires !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(suppression.expires))) {
          throw new Error(`${filename} rules.${ruleId}.ignore expires must use YYYY-MM-DD.`);
        }
        if (suppression.expires !== undefined && !isCalendarDate(String(suppression.expires))) {
          throw new Error(`${filename} rules.${ruleId}.ignore expires must be a real calendar date.`);
        }
      }
    }
  }
  return config;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
