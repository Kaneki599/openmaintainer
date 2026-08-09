# OpenMaintainer

[![Verify](https://github.com/Kaneki599/openmaintainer/actions/workflows/verify.yml/badge.svg)](https://github.com/Kaneki599/openmaintainer/actions/workflows/verify.yml)
[![Release](https://img.shields.io/github/v/release/Kaneki599/openmaintainer?display_name=tag)](https://github.com/Kaneki599/openmaintainer/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-7c3aed)](LICENSE)

<p align="center">
  <img src="docs/images/openmaintainer-hero.png" alt="OpenMaintainer security report illustration" width="860">
</p>

**Turn repository security and maintenance signals into an actionable cockpit.**

OpenMaintainer is a local-first, read-only GitHub Action and CLI for individual
maintainers, open-source projects, platform teams, and GitHub organizations. It
scans the repository already checked out by CI, explains each finding, and
never uploads source code or rewrites repository files.

<p align="center"><strong>One command. Clear locations. Actionable fixes.</strong></p>

## See the result

<p align="center">
  <img src="docs/images/report-demo.svg" alt="Example OpenMaintainer report showing an error and warnings" width="860">
</p>

It combines structural GitHub Actions analysis, repository health checks,
baselines, shared policies, native annotations, SARIF, standalone HTML reports,
third-party result aggregation, and GitHub owner portfolio views.

## Try it in 30 seconds

Add this job to any repository you control:

```yaml
name: OpenMaintainer

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - uses: Kaneki599/openmaintainer@v0
        with:
          formats: markdown,sarif,html
```

The workflow fails only for **error** findings. Warnings and informational
findings leave CI green while still producing a report.

## Why OpenMaintainer?

- **Explainable:** every finding points to a file, line, and remediation.
- **Local-first:** the scanner reads the checkout it is given.
- **Safe by default:** it only reports; it never changes a repository.
- **Adoptable:** four presets support gradual rollout from essential checks to strict enforcement.
- **Composable:** versioned JSON, SARIF, Markdown, terminal, and standalone HTML outputs.
- **Organization-ready:** shared policy layering and multi-repository GitHub portfolio analysis.
- **Interoperable:** aggregate OpenMaintainer, SARIF, and OpenSSF Scorecard results.

## CLI

Requires Node.js 20 or newer.

```sh
npx openmaintainer@latest scan .
```

## Scan a repository

```sh
npx openmaintainer scan .
npx openmaintainer scan . --format json --output openmaintainer-report.json
npx openmaintainer scan . --format sarif --output openmaintainer.sarif
npx openmaintainer scan . --changed origin/main
```

An `error` finding returns exit code `1`; warnings and informational findings
do not fail CI.

### Configuration

Create a reviewed configuration and GitHub workflow automatically:

```sh
npx openmaintainer init .
```

Or configure the policy directly:

```yaml
version: 1
preset: maintainer
failOn: error
baseline:
  file: .openmaintainer/baseline.json
  mode: new
rules:
  permissions-implicit:
    severity: error
  action-unpinned:
    ignore:
      - path: .github/workflows/vendor.yml
        reason: Migration tracked in issue 42
        expires: 2027-01-31
```

Presets are `starter`, `maintainer`, `security`, and `strict`. A shared policy
can be applied with `--policy`, while repository configuration retains explicit
local overrides. See [configuration](docs/configuration.md) and the complete
[rule reference](docs/rules.md).

### Baseline existing findings

```sh
npx openmaintainer baseline create .
npx openmaintainer baseline check .
```

Baseline mode lets established repositories fail only on newly introduced
findings while keeping existing debt visible.

### Aggregate existing tools

```sh
npx openmaintainer aggregate openmaintainer.json codeql.sarif scorecard.json \
  --format html --output engineering-health.html
```

OpenMaintainer accepts its versioned JSON report, SARIF 2.1.0, and OpenSSF
Scorecard JSON. Imported findings retain their originating tool name.

### Analyze a GitHub owner

```sh
GITHUB_TOKEN=ghp_... npx openmaintainer github org example \
  --limit 100 --format html --output portfolio.html
```

This opt-in command reads selected repository metadata and workflow files from
the GitHub API, ranks repositories, and produces a portable portfolio report.
The local `scan` command and GitHub Action do not require an OpenMaintainer account.

## GitHub Action

```yaml
- uses: Kaneki599/openmaintainer@v0
  with:
    formats: markdown,sarif,html
    report-directory: .openmaintainer/reports
    preset: maintainer
    annotations: "true"
    summary: "true"
```

The action is read-only. It scans the checked-out repository and writes a
report; it does not upload source code or alter workflow files.

## Releases and Marketplace

Use an exact release tag when reproducibility is the priority. The `v0` tag is
maintained as the current compatible release channel.

Marketplace publication has one owner-only GitHub step; see
[docs/marketplace-submission.md](docs/marketplace-submission.md).

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and rule standards, and
[SECURITY.md](SECURITY.md) for responsible vulnerability reporting.

## What is included

- 16 structural workflow-security rules with YAML source locations.
- 12 repository, maintenance, release, and supply-chain checks.
- Deterministic fingerprints, expiring suppressions, and baseline comparison.
- Native GitHub annotations, job summaries, and optional idempotent PR comments.
- A TypeScript API for custom integrations and report processing.

See [integrations](docs/integrations.md) for Code Scanning upload, policy
distribution, pull-request comments, and portfolio usage.

See [CHANGELOG.md](CHANGELOG.md) for release notes and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations.

## License

[Apache-2.0](LICENSE)
