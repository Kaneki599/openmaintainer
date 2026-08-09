# Configuration

OpenMaintainer reads `openmaintainer.yml` from the repository root. The file is
versioned so incompatible configuration changes can fail clearly.

```yaml
version: 1
preset: maintainer
failOn: error
baseline:
  file: .openmaintainer/baseline.json
  mode: new
github:
  annotations: true
  summary: true
  pullRequestComment: false
```

## Presets

| Preset | Intended adoption |
| --- | --- |
| `starter` | Essential high-signal checks for a first rollout |
| `maintainer` | Workflow security and repository health defaults |
| `security` | Workflow and supply-chain checks without maintenance guidance |
| `strict` | All checks, with default warnings promoted to errors |

Explicit rule settings always override preset behavior:

```yaml
rules:
  codeowners-missing:
    enabled: false
  permissions-implicit:
    severity: error
```

## Justified suppressions

A suppression requires a reason and can expire automatically:

```yaml
rules:
  action-unpinned:
    ignore:
      - path: .github/workflows/vendor.yml
        reason: Upstream does not publish immutable references
        expires: 2027-01-31
```

## Shared policies

Repositories can inherit another file:

```yaml
version: 1
extends: .github/openmaintainer-policy.yml
rules:
  changelog-missing:
    enabled: false
```

CI can also apply an external or centrally provisioned file:

```sh
openmaintainer scan . --policy organization-policy.yml
```

The shared policy is loaded first. Repository configuration then supplies local
overrides. Circular inheritance and invalid values fail with an actionable error.

## Failure policy and baselines

`failOn` accepts `error`, `warning`, `info`, or `never`. With baseline mode
`new`, only findings absent from the stored baseline affect the exit status.

```sh
openmaintainer baseline create .
openmaintainer baseline check .
```
