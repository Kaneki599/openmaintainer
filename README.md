# OpenMaintainer

OpenMaintainer is an explainable, local-first health check for GitHub repositories.
It helps maintainers find workflow-security gaps and missing project governance
without sending repository contents to a third party.

## Status

The first release focuses on static checks for GitHub Actions workflows. It is
designed to run locally or in continuous integration.

## Principles

- **Explainable:** every finding points to a file, line, and remediation.
- **Local-first:** the scanner reads the checkout it is given.
- **Safe by default:** it only reports; it never changes a repository.
- **Composable:** checks emit a stable JSON report for CI and other tools.

## Development

Requires Node.js 20 or newer.

```sh
npm install
npm run check
npm test
```

## Scan a repository

```sh
npx openmaintainer scan .
npx openmaintainer scan . --format json --output openmaintainer-report.json
```

An `error` finding returns exit code `1`; warnings and informational findings
do not fail CI.

## GitHub Action

```yaml
- uses: Kaneki599/openmaintainer@v0.1.0
  with:
    format: markdown
    output: openmaintainer-report.md
```

The action is read-only. It scans the checked-out repository and writes a
report; it does not upload source code or alter workflow files.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and rule standards, and
[SECURITY.md](SECURITY.md) for responsible vulnerability reporting.

## License

[Apache-2.0](LICENSE)
