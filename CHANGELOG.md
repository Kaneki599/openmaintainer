# Changelog

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
