# FortifyLens CLI

**Security scanning for CI/CD pipelines.**

`fortifylens-cli` scans your source code and dependency manifests with the
FortifyLens backend (SAST code review + OSV-backed dependency analysis),
prints a severity-ordered report, writes a machine-readable JSON artifact,
and fails the build when critical or high severity findings are detected —
perfect for pull request checks and nightly pipelines.

## Requirements

- Node.js **18+** (uses the built-in `fetch`)
- A FortifyLens **API key** (generated from the FortifyLens dashboard —
  *Organization → API Keys*) and the project ID you want scans attached to

## Installation

Global install:

```bash
npm install -g fortifylens-cli
fortifylens scan --project-id <your-project-id>
```

Or run it directly with npx — no install step:

```bash
npx fortifylens-cli scan --project-id <your-project-id> --all
```

From this repository (development):

```bash
cd fortifylens-cli
npm install
node bin/cli.js scan --project-id <your-project-id> --all
```

## Environment variables

| Variable                | Description                                                                 | Default                  |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------ |
| `FORTIFYLENS_API_KEY`   | API key used for the `X-API-Key` header. Overridden by `--api-key`.         | — (required one or the other) |
| `FORTIFYLENS_SERVER_URL`| Base URL of the FortifyLens backend. Overridden by `--server-url`.          | `http://localhost:5000`  |

## Usage

```
fortifylens scan --project-id <id> [options]
```

| Option                    | Description                                                            |
| ------------------------- | ---------------------------------------------------------------------- |
| `--project-id <id>`       | **Required.** FortifyLens project the scan results are attached to.    |
| `--api-key <key>`         | API key. Falls back to `FORTIFYLENS_API_KEY`, error if neither is set. |
| `--server-url <url>`      | Backend base URL. Falls back to `FORTIFYLENS_SERVER_URL`, then `http://localhost:5000`. |
| `--base-branch <branch>`  | Base branch for the git diff (default: auto-detect — `origin/HEAD`, then `origin/main`, `origin/master`, `main`, `master`). |
| `--all`                   | Scan **all** files instead of only the ones changed vs the base branch. |
| `--path <dir>`            | Directory to scan (default: `.`).                                      |
| `--output <file>`         | Path for the JSON results artifact (default: `fortifylens-results.json`). |

### Local development

Scan everything in the current directory against a local backend:

```bash
export FORTIFYLENS_API_KEY=fl_live_xxxxxxxxxxxxxxxx
fortifylens scan --project-id proj_8f3k2 --all
```

Scan only the files changed on your feature branch:

```bash
fortifylens scan --project-id proj_8f3k2 --base-branch origin/main
```

### CI (GitHub Actions)

```yaml
name: Security Scan
on: [pull_request, push]

jobs:
  fortifylens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full history so the git diff against the base branch works

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: FortifyLens security scan
        env:
          FORTIFYLENS_API_KEY: ${{ secrets.FORTIFYLENS_API_KEY }}
          FORTIFYLENS_SERVER_URL: ${{ vars.FORTIFYLENS_SERVER_URL }}
        run: |
          npx fortifylens-cli scan \
            --project-id ${{ vars.FORTIFYLENS_PROJECT_ID }} \
            --base-branch origin/main

      - name: Upload scan artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: fortifylens-results
          path: fortifylens-results.json
```

The CLI authenticates with the `X-API-Key` header, so the key must be a
**CI API key issued by your FortifyLens organization** — never a personal
password or Firebase token.

## What gets scanned

- **Source files** (`.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.java`, `.go`,
  `.rb`, `.php`, `.cs`) → `POST /api/analysis/code` (SAST review)
- **Dependency manifests** (`package.json`, `package-lock.json`,
  `requirements.txt`, `Pipfile`, `go.mod`, `pom.xml`, `build.gradle`,
  `Gemfile`) → `POST /api/analysis/dependencies` (OSV vulnerability lookup)

By default only files changed vs the base branch are scanned
(`git diff --name-only <base>...HEAD`); pass `--all` for a full scan.
Common noise directories (`node_modules`, `.git`, `dist`, `build`,
`vendor`, `__pycache__`, …) are always skipped. Each request is retried up
to 3 times with exponential backoff (1s → 2s → 4s); a file that keeps
failing is skipped with a warning so the rest of the scan still completes.

## Exit codes

| Code | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| `0`  | Scan completed — no critical or high severity findings (build passes)         |
| `1`  | Scan completed — at least one **critical or high** finding (build fails)      |
| `2`  | Scan could not run — missing API key, rejected key, unreachable server, etc.  |

## Results artifact

Every run writes `fortifylens-results.json` (override with `--output`):

```json
{
  "tool": "fortifylens-cli",
  "generatedAt": "2026-08-26T10:12:44.201Z",
  "summary": {
    "total": 4,
    "critical": 1,
    "high": 2,
    "medium": 1,
    "low": 0,
    "blocking": true
  },
  "findings": [
    {
      "file": "src/routes/auth.js",
      "severity": "critical",
      "type": "SQL Injection",
      "message": "User input concatenated directly into a query string",
      "line": 42,
      "recommendation": "Use parameterized queries or an ORM.",
      "cwe": "A03:2021 - Injection"
    }
  ]
}
```

## Example output

```text
$ fortifylens scan --project-id proj_8f3k2
fortifylens: auto-detected base branch: origin/main
fortifylens: v1.0.0 | server: http://localhost:5000 | project: proj_8f3k2
fortifylens: mode: changed files vs origin/main | root: /repo/checkout
fortifylens: [1/4] code review — src/routes/auth.js
fortifylens: [2/4] code review — src/db/users.ts
fortifylens: [3/4] dependency scan — package.json
fortifylens: [4/4] dependency scan — requirements.txt
FILE                                   | SEVERITY  | TYPE                    | MESSAGE                                        | LINE
---------------------------------------|-----------|-------------------------|------------------------------------------------|-----
src/db/users.ts                        | CRITICAL  | SQL Injection           | User input concatenated directly into a query  |   42
src/routes/auth.js                     | HIGH      | Hardcoded Secret        | API key literal detected in source code        |  117
package.json                           | HIGH      | GHSA-29mw-w46h-x8q3     | Prototype pollution in lodash < 4.17.21        |    0
src/routes/auth.js                     | MEDIUM    | Verbose Error Handling  | Error details leaked to the client             |   84

Findings by severity: 1 critical · 2 high · 1 medium · 0 low (4 total)
Status: FAIL — critical or high severity findings block this build.
fortifylens: full results written to fortifylens-results.json
fortifylens: result: FAIL — critical/high findings present
$ echo $?
1
```

Severity is color-coded in terminals (red = critical, yellow = high,
cyan = medium, dim = low). Progress and warnings go to **stderr**, the
report table goes to **stdout**, so you can pipe the report cleanly.
Set `NO_COLOR=1` to disable colors or `FORCE_COLOR=1` to force them.

## License

MIT
