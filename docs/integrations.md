# Integrations

## GitHub Code Scanning

Generate SARIF and upload it with GitHub's official upload action:

```yaml
permissions:
  contents: read
  security-events: write

steps:
  - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8
  - uses: Kaneki599/openmaintainer@v0
    with:
      formats: sarif
      output: openmaintainer.sarif
  - uses: github/codeql-action/upload-sarif@c3400c2f38909e0dcf3c3a41f2030a8217be5d3e # v3
    with:
      sarif_file: openmaintainer.sarif
```

Pin every action to a reviewed commit SHA in security-sensitive workflows.

## Pull request comments

Comments are disabled by default. When enabled, OpenMaintainer creates one
marked comment and updates it on later runs instead of adding duplicates.

```yaml
permissions:
  contents: read
  pull-requests: write

steps:
  - uses: Kaneki599/openmaintainer@v0
    with:
      pull-request-comment: "true"
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

Annotations and the job summary do not require comment permissions.

## Third-party result aggregation

The `aggregate` command accepts OpenMaintainer JSON v2, SARIF 2.1.0, and
OpenSSF Scorecard JSON:

```sh
openmaintainer aggregate reports/*.sarif scorecard.json \
  --format html --output combined.html
```

## GitHub portfolio

The portfolio command supports GitHub organizations and users:

```sh
GITHUB_TOKEN=... openmaintainer github org example --format html --output portfolio.html
```

Only repository health files and `.github/workflows/*.yml` are downloaded into
an isolated temporary directory for analysis. The directory is removed after
each repository. Archived repositories are excluded unless
`--include-archived` is supplied.

## Container

Versioned, compatible-major, and latest images are published to GitHub Container
Registry:

```sh
docker run --rm -v "$PWD:/workspace" ghcr.io/kaneki599/openmaintainer:v0 scan . \
  --format html --output report.html
```

Use a version tag such as `v0.2.2` when an immutable deployment reference is required.
