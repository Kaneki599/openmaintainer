# Contributing to OpenMaintainer

Issues and pull requests are welcome. Please open an issue first for a new
rule so its security value, expected false positives, and remediation can be
reviewed before implementation.

## Development checks

```sh
npm ci
npm run check
npm test
npm run bundle:action
```

If `src/action.ts` or scanner code changes, commit the regenerated
`dist/action.cjs` so GitHub Action users receive the executable bundle.

## Rule expectations

Each rule must have a stable identifier, a severity, a precise location when
available, an actionable remediation, and tests for both detection and a safe
case. Rules must never modify the scanned repository.
