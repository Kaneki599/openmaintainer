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

## License

[Apache-2.0](LICENSE)
