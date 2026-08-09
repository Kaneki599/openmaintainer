import { createHash } from "node:crypto";
import type { Finding, Rule, RuleContext, RuleMetadata, Severity } from "../types.js";
import type { IndexedYamlNode, WorkflowDocument } from "../workflow-model.js";
import { parseWorkflow } from "../workflow-model.js";

const SHA_PIN = /^[a-f0-9]{40}$/i;
const HELP_ROOT = "https://github.com/Kaneki599/openmaintainer/blob/main/docs/rules.md";

export const workflowRules: Rule[] = [
  rule(meta("workflow-invalid-yaml", "Invalid workflow YAML", "The workflow cannot be parsed reliably.", "error", "high"), invalidYaml),
  rule(meta("action-unpinned", "Third-party action is not pinned", "Third-party actions should use an immutable commit SHA.", "warning", "high", ["supply-chain"]), unpinnedActions),
  rule(meta("docker-unpinned", "Docker action image is mutable", "Docker action images should use an immutable digest.", "warning", "high", ["supply-chain"]), unpinnedDockerActions),
  rule(meta("permissions-write-all", "Workflow grants write-all", "GITHUB_TOKEN should receive only required permissions.", "error", "high"), writeAllPermissions),
  rule(meta("permissions-implicit", "Workflow permissions are implicit", "Explicit least-privilege permissions make token access reviewable.", "info", "high"), implicitPermissions),
  rule(meta("unsafe-pull-request-target", "Privileged pull_request_target trigger", "This trigger runs in the base repository security context.", "warning", "high"), pullRequestTarget),
  rule(meta("unsafe-workflow-run", "Privileged workflow_run trigger", "Artifacts and metadata from an earlier workflow may cross a trust boundary.", "warning", "high"), workflowRun),
  rule(meta("secrets-in-privileged-workflow", "Secret used in privileged workflow", "Secrets combined with privileged triggers require a strict trust boundary.", "error", "high"), privilegedSecrets),
  rule(meta("expression-injection", "Untrusted expression interpolated into shell", "GitHub event values should not be expanded directly into run scripts.", "error", "high", ["injection"]), expressionInjection),
  rule(meta("self-hosted-untrusted", "Self-hosted runner handles untrusted change", "Untrusted pull requests can persist on or pivot from self-hosted runners.", "error", "high"), selfHostedUntrusted),
  rule(meta("checkout-persists-credentials", "Checkout credentials remain available", "Persisted repository credentials increase impact if a later step is compromised.", "warning", "medium"), checkoutCredentials),
  rule(meta("privileged-oidc", "OIDC token enabled in privileged workflow", "OIDC write access should be scoped to a trusted deployment job.", "warning", "medium"), privilegedOidc),
  rule(meta("untrusted-checkout-ref", "Privileged workflow checks out an untrusted ref", "A privileged workflow must not execute code selected by pull-request input.", "error", "high"), untrustedCheckoutRef),
  rule(meta("issue-comment-command", "Issue comment controls a privileged command", "Comment-driven automation needs authorization before executing commands.", "warning", "medium"), issueCommentCommand),
  rule(meta("cache-key-untrusted", "Privileged cache key uses pull-request data", "Untrusted cache keys can allow cache poisoning across trust boundaries.", "warning", "medium"), untrustedCacheKey),
  rule(meta("workflow-artifact-trust", "Privileged workflow consumes prior artifacts", "Downloaded artifacts must be bound to a trusted producer and validated before use.", "warning", "medium"), workflowArtifactTrust),
  rule(meta("shell-download-execution", "Downloaded content is piped to a shell", "Executing network content without prior verification creates a direct code-execution path.", "warning", "high", ["supply-chain"]), shellDownloadExecution),
  rule(meta("world-writable-files", "Workflow creates world-writable files", "World-writable permissions allow unrelated processes to replace or modify files.", "warning", "high"), worldWritableFiles),
  rule(meta("github-script-injection", "Untrusted expression interpolated into github-script", "Expressions inside github-script source can alter JavaScript syntax before execution.", "error", "high", ["injection"]), githubScriptInjection),
];

export function checkWorkflowSecurity(path: string, source: string): Finding[] {
  const workflow = parseWorkflow(path, source);
  const context = { root: ".", workflows: [workflow], config: null } as unknown as RuleContext;
  return workflowRules.flatMap((candidate) => candidate.run(context) as Finding[]);
}

function rule(metaValue: RuleMetadata, run: (document: WorkflowDocument, metaValue: RuleMetadata) => Finding[]): Rule {
  return {
    meta: metaValue,
    run: (context) => context.workflows.flatMap((document) => run(document, metaValue)),
  };
}

function meta(id: string, title: string, description: string, severity: Severity, confidence: RuleMetadata["confidence"], tags: string[] = []): RuleMetadata {
  return { id, title, description, category: "workflow-security", defaultSeverity: severity, confidence, helpUri: `${HELP_ROOT}#${id}`, tags };
}

function invalidYaml(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  return document.errors.map((error) => makeFinding(metaValue, document, undefined, error.message, "Fix the YAML syntax before relying on this workflow.", error.message, error.location));
}

function unpinnedActions(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  return document.findByKey("uses").flatMap((entry) => {
    if (typeof entry.value !== "string" || entry.value.startsWith("./") || entry.value.startsWith("docker://") || !entry.value.includes("@")) return [];
    const revision = entry.value.slice(entry.value.lastIndexOf("@") + 1);
    return SHA_PIN.test(revision) ? [] : [makeFinding(metaValue, document, entry, `Action '${entry.value}' uses a mutable tag or branch.`, "Pin the action to a full commit SHA and retain the release name in a comment.", entry.value)];
  });
}

function unpinnedDockerActions(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  return document.findByKey("uses").flatMap((entry) => {
    if (typeof entry.value !== "string" || !entry.value.startsWith("docker://")) return [];
    return entry.value.includes("@sha256:") ? [] : [makeFinding(metaValue, document, entry, `Docker action '${entry.value}' is not pinned by digest.`, "Use an immutable sha256 image digest.", entry.value)];
  });
}

function writeAllPermissions(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  return document.findByKey("permissions").filter((entry) => entry.value === "write-all").map((entry) => makeFinding(metaValue, document, entry, "Workflow grants write-all permissions to GITHUB_TOKEN.", "Declare only the permissions required by each job.", entry.pointer));
}

function implicitPermissions(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!document.data || document.findByPointer("/permissions")) return [];
  return [makeFinding(metaValue, document, undefined, "Workflow does not explicitly restrict GITHUB_TOKEN permissions.", "Add a top-level permissions block using least privilege.", "top-level")];
}

function pullRequestTarget(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!hasTrigger(document, "pull_request_target")) return [];
  return [makeFinding(metaValue, document, triggerEntry(document, "pull_request_target"), "pull_request_target runs with the base repository context.", "Prefer pull_request, or ensure no untrusted code or artifact is executed.", "pull_request_target")];
}

function workflowRun(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!hasTrigger(document, "workflow_run")) return [];
  return [makeFinding(metaValue, document, triggerEntry(document, "workflow_run"), "workflow_run may cross a workflow trust boundary.", "Validate artifact origin and contents, and restrict token permissions.", "workflow_run")];
}

function privilegedSecrets(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!hasPrivilegedTrigger(document)) return [];
  return entriesContaining(document, /\bsecrets\.[A-Za-z0-9_]+/).map((entry) => makeFinding(metaValue, document, entry, "A repository secret is referenced in a privileged workflow.", "Separate secret-bearing work from untrusted inputs and validate the trust boundary.", String(entry.value)));
}

function expressionInjection(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  const untrusted = /\$\{\{\s*(?:github\.event\.(?:issue|pull_request|comment|review|head_commit)|github\.head_ref|inputs\.)/;
  return document.findByKey("run").filter((entry) => typeof entry.value === "string" && untrusted.test(entry.value)).map((entry) => makeFinding(metaValue, document, entry, "A potentially untrusted expression is interpolated directly into a run script.", "Pass the value through an environment variable and quote it in the target shell.", String(entry.value)));
}

function selfHostedUntrusted(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!hasTrigger(document, "pull_request") && !hasTrigger(document, "pull_request_target")) return [];
  return document.findByKey("runs-on").filter((entry) => entry.value === "self-hosted" || (Array.isArray(entry.value) && entry.value.includes("self-hosted"))).map((entry) => makeFinding(metaValue, document, entry, "A self-hosted runner is reachable from a pull-request workflow.", "Use an isolated ephemeral runner or restrict execution to trusted branches and actors.", entry.pointer));
}

function checkoutCredentials(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!hasTrigger(document, "pull_request_target") && !hasTrigger(document, "workflow_run")) return [];
  return document.findByKey("uses").filter((entry) => typeof entry.value === "string" && entry.value.startsWith("actions/checkout@")).flatMap((entry) => {
    const stepPointer = entry.pointer.replace(/\/uses$/, "");
    const setting = document.findByPointer(`${stepPointer}/with/persist-credentials`);
    return setting?.value === false ? [] : [makeFinding(metaValue, document, setting ?? entry, "Checkout credentials remain available to later steps in a privileged workflow.", "Set with.persist-credentials to false unless later authenticated git operations are required.", stepPointer)];
  });
}

function privilegedOidc(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!hasPrivilegedTrigger(document)) return [];
  return document.findByKey("id-token").filter((entry) => entry.value === "write").map((entry) => makeFinding(metaValue, document, entry, "OIDC token minting is enabled in a privileged workflow.", "Move id-token: write to the smallest trusted deployment job and protect its environment.", entry.pointer));
}

function untrustedCheckoutRef(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!hasPrivilegedTrigger(document)) return [];
  return document.findByKey("ref").filter((entry) => typeof entry.value === "string" && /github\.event\.pull_request\.(?:head\.)?sha|github\.head_ref/.test(entry.value) && /\/steps\/\d+\/with\/ref$/.test(entry.pointer)).map((entry) => makeFinding(metaValue, document, entry, "A privileged workflow checks out a pull-request-controlled ref.", "Do not execute pull-request code in a privileged workflow; split analysis and privileged follow-up jobs.", String(entry.value)));
}

function issueCommentCommand(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!hasTrigger(document, "issue_comment")) return [];
  return document.findByKey("run").filter((entry) => typeof entry.value === "string" && /github\.event\.comment\.body/.test(entry.value)).map((entry) => makeFinding(metaValue, document, entry, "An issue comment is interpolated into a command.", "Authorize the actor and parse an allowlisted command without direct shell interpolation.", String(entry.value)));
}

function untrustedCacheKey(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!hasPrivilegedTrigger(document)) return [];
  return document.findByKey("key").filter((entry) => /\/steps\/\d+\/with\/key$/.test(entry.pointer) && typeof entry.value === "string" && /github\.event\.pull_request|github\.head_ref/.test(entry.value)).map((entry) => makeFinding(metaValue, document, entry, "A privileged workflow cache key contains pull-request-controlled data.", "Use trusted immutable inputs for cache keys and prevent untrusted workflows from writing privileged caches.", String(entry.value)));
}

function workflowArtifactTrust(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  if (!hasTrigger(document, "workflow_run")) return [];
  return document.findByKey("uses").filter((entry) => typeof entry.value === "string" && entry.value.startsWith("actions/download-artifact@")).map((entry) => makeFinding(metaValue, document, entry, "A workflow_run workflow downloads an artifact from an earlier run.", "Bind the artifact to an expected workflow and commit, then validate contents before execution.", entry.pointer));
}

function shellDownloadExecution(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  const pattern = /(?:curl|wget)\b[^\n|]*(?:\||\|&)\s*(?:sudo\s+)?(?:ba|z|k)?sh\b/i;
  return document.findByKey("run").filter((entry) => typeof entry.value === "string" && pattern.test(entry.value)).map((entry) => makeFinding(metaValue, document, entry, "A network response is executed directly by a shell.", "Download the file, verify its checksum or signature, then execute the verified local copy.", String(entry.value)));
}

function worldWritableFiles(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  return document.findByKey("run").filter((entry) => typeof entry.value === "string" && /\bchmod\s+(?:-[A-Za-z]+\s+)*(?:0?777|a\+rwx)\b/.test(entry.value)).map((entry) => makeFinding(metaValue, document, entry, "A workflow command grants write access to every user.", "Grant only the owner or group permissions required by the following step.", String(entry.value)));
}

function githubScriptInjection(document: WorkflowDocument, metaValue: RuleMetadata): Finding[] {
  const untrusted = /\$\{\{\s*(?:github\.event\.(?:issue|pull_request|comment|review|head_commit)|github\.head_ref|inputs\.)/;
  return document.findByKey("uses").filter((entry) => typeof entry.value === "string" && entry.value.startsWith("actions/github-script@")).flatMap((entry) => {
    const script = document.findByPointer(`${entry.pointer.replace(/\/uses$/, "")}/with/script`);
    return typeof script?.value === "string" && untrusted.test(script.value) ? [makeFinding(metaValue, document, script, "A potentially untrusted expression is interpolated into github-script source.", "Assign the expression to an environment variable and read it through process.env inside the script.", script.value)] : [];
  });
}

function makeFinding(metaValue: RuleMetadata, document: WorkflowDocument, entry: IndexedYamlNode | undefined, message: string, remediation: string, evidence: string, location = entry?.location): Finding {
  const path = location?.path ?? document.path;
  const fingerprint = createHash("sha256").update([metaValue.id, path, evidence].join("\0")).digest("hex");
  return { ruleId: metaValue.id, source: "openmaintainer", category: metaValue.category, severity: metaValue.defaultSeverity, confidence: metaValue.confidence, title: metaValue.title, message, remediation, helpUri: metaValue.helpUri, location: location ?? { path }, fingerprint };
}

function hasPrivilegedTrigger(document: WorkflowDocument): boolean {
  return hasTrigger(document, "pull_request_target") || hasTrigger(document, "workflow_run") || hasTrigger(document, "issue_comment");
}

function hasTrigger(document: WorkflowDocument, name: string): boolean {
  const on = document.data?.on;
  return on === name || (Array.isArray(on) && on.includes(name)) || (isRecord(on) && Object.hasOwn(on, name));
}

function triggerEntry(document: WorkflowDocument, name: string): IndexedYamlNode | undefined {
  return document.findByPointer(`/on/${name}`) ?? document.findByPointer("/on");
}

function entriesContaining(document: WorkflowDocument, pattern: RegExp): IndexedYamlNode[] {
  return document.entries.filter((entry) => typeof entry.value === "string" && pattern.test(entry.value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
