# Changelog

## 0.1.0 — 2026-08-08

First public release.

- Local CLI with Markdown and JSON reports.
- GitHub Action bundle that runs without an external service.
- Checks for invalid workflow YAML, unpinned third-party actions, implicit and
  `write-all` permissions, privileged triggers, and secrets in privileged workflows.
- Optional, explicit `openmaintainer.yml` rule suppressions.

This release is intentionally read-only: it reports findings but never edits a
repository or uploads its source.
