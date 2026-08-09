# Changelog

## 0.2.2 — 2026-08-09

- Verify the CLI on Node.js 20, 22, and 24 in continuous integration.
- Publish multi-architecture container images for Linux amd64 and arm64.
- Move container publishing actions to their Node.js 24 releases.
- Keep unavailable repositories visible without aborting an organization portfolio scan.
- Explain anonymous GitHub API rate limits with direct token guidance.

## 0.2.1 — 2026-08-09

- Detect direct download-to-shell execution and world-writable file permissions.
- Detect untrusted expression interpolation in `actions/github-script`.
- Report JavaScript packages that do not declare their supported Node.js range.
- Keep automated compiler and runtime type updates within supported major versions.
- Harden release packaging and make reruns idempotent.

## 0.2.0 — 2026-08-09

- Replace text matching with structural YAML workflow analysis and exact source locations.
- Expand to 28 workflow security, repository, maintenance, release, and supply-chain rules.
- Add effective starter, maintainer, security, and strict presets.
- Add versioned configuration, shared policy layering, expiring suppressions, and baselines.
- Add terminal, Markdown, JSON v2, SARIF 2.1.0, and standalone HTML reports.
- Add native annotations, job summaries, and optional idempotent pull-request comments.
- Add SARIF and OpenSSF Scorecard aggregation.
- Add GitHub organization or user portfolio analysis with HTML and JSON output.
- Prepare the CLI package for npm distribution.

## 0.1.2 — 2026-08-08

- Add GitHub Marketplace branding and a stable major-version release channel.
- Add a launch-oriented README, report preview, and Marketplace publication guide.

## 0.1.1 — 2026-08-08

- Fix the GitHub Action manifest so GitHub can load the Action.
- Add a test that validates the Action manifest YAML.
- Use the supported Node.js 24 GitHub Actions runtime.
- Update the pinned checkout action to its Node.js 24 release.

## 0.1.0 — 2026-08-08

First public release.

- Local CLI with Markdown and JSON reports.
- GitHub Action bundle that runs without an external service.
- Checks for invalid workflow YAML, unpinned third-party actions, implicit and
  `write-all` permissions, privileged triggers, and secrets in privileged workflows.
- Optional, explicit `openmaintainer.yml` rule suppressions.

This release is intentionally read-only: it reports findings but never edits a
repository or uploads its source.
