# Rules

OpenMaintainer rules are deterministic and explainable. Each finding includes
the rule identifier, confidence, exact source location when available, and a
recommended remediation. Rules can be enabled, disabled, or assigned another
severity in `openmaintainer.yml`.

## Workflow security

### workflow-invalid-yaml

Reports workflow YAML that cannot be parsed. Fix syntax errors before relying
on any other analysis of the workflow.

### action-unpinned

Reports third-party actions referenced by a mutable tag or branch. Pin the
action to its full commit SHA and retain the human-readable release in a comment.

### docker-unpinned

Reports Docker actions without an immutable `sha256` digest.

### permissions-write-all

Reports `write-all` token permissions. Grant only the scopes needed by the
smallest possible job.

### permissions-implicit

Reports workflows that inherit the repository's default token permissions.
Declare a top-level least-privilege `permissions` block.

### unsafe-pull-request-target

Reports use of `pull_request_target`, whose privileged base-repository context
must never execute untrusted pull-request code.

### unsafe-workflow-run

Reports `workflow_run` trust boundaries. Validate the originating workflow,
commit, and artifacts before privileged processing.

### secrets-in-privileged-workflow

Reports secret references in privileged event workflows. Separate untrusted
analysis from secret-bearing follow-up work.

### expression-injection

Reports untrusted GitHub expressions interpolated directly into shell scripts.
Pass values through environment variables and quote them in the target shell.

### self-hosted-untrusted

Reports self-hosted runners exposed to pull-request events. Use ephemeral,
isolated runners or restrict execution to trusted actors.

### checkout-persists-credentials

Reports checkout credentials left available in privileged workflows. Set
`persist-credentials: false` unless later authenticated Git operations need it.

### privileged-oidc

Reports OIDC token minting in privileged workflows. Restrict it to a protected
deployment job and environment.

### untrusted-checkout-ref

Reports privileged checkout of a pull-request-controlled ref.

### issue-comment-command

Reports issue-comment content interpolated into commands. Authorize the actor
and parse an allowlisted command without shell interpolation.

### cache-key-untrusted

Reports privileged cache keys containing pull-request-controlled data.

### workflow-artifact-trust

Reports artifact downloads across a `workflow_run` boundary. Bind artifacts to
the expected workflow and commit, then validate their contents.

## Repository health

### repository-readme-missing

Add a README that explains the problem, installation, minimal use, support,
and the project's current scope.

### repository-license-missing

Add an OSI-approved license so users and contributors have explicit terms.

### security-policy-missing

Add `SECURITY.md` with supported versions and a private disclosure channel.

### contributing-guide-missing

Add setup, testing, pull-request, and review instructions.

### codeowners-missing

Add CODEOWNERS entries for critical paths and active reviewers.

### pull-request-template-missing

Add a concise pull-request template covering rationale, tests, and compatibility.

### issue-templates-missing

Add issue forms for actionable bug reports and feature proposals.

### dependency-updates-missing

Configure Dependabot or Renovate with a manageable update and review cadence.

### changelog-missing

Maintain a changelog for notable behavior changes and upgrade considerations.

### support-policy-missing

Document supported help channels and response expectations in `SUPPORT.md`.

### package-metadata-incomplete

Add package description, license, repository, and issue tracker metadata.

### package-lock-missing

Commit the lockfile produced by the package manager used in CI.

## Configuration example

```yaml
version: 1
preset: maintainer
rules:
  permissions-implicit:
    severity: error
  action-unpinned:
    ignore:
      - path: .github/workflows/vendor.yml
        reason: Migration is tracked in issue 42
        expires: 2027-01-31
```

Suppressions require a reason. Expiring suppressions are ignored after their
date so accepted risk is revisited instead of becoming permanent silently.
