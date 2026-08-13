# Release Checklist

Each release publishes two artifacts:

- npm package: `@lucaspdude/rocinante`
- GitHub Release: [lucaspdude/ompweb](https://github.com/lucaspdude/ompweb)

After the initial bootstrap release, publishing is performed by GitHub Actions
with npm trusted publishing. No npm access token is stored in this repository
or in GitHub secrets.

## Bootstrap the first release

`@lucaspdude/rocinante` is not registered on npm yet. npm exposes trusted-publisher settings
only for an existing package, so version `0.3.0` must be published once from a
reviewed local checkout using the authenticated npm account:

```bash
npm ci
npm test
npm run build
npm pack --dry-run
npm publish --access public
```

Do not create a tag or GitHub Release for this bootstrap version: npm will
reject a duplicate version.
After this succeeds, configure trusted publishing before publishing any later
version.

## One-time trusted-publisher setup

1. In npm, open the `@kahme247/ompweb` package settings and add a **GitHub Actions**
   trusted publisher with:
   - Owner: `kahme247`
   - Repository: `ompweb`
   - Workflow filename: `publish.yml`
   - Environment: `npm`
2. In GitHub, create the `npm` environment for this repository. Add required
   reviewers if releases need approval.
3. Confirm Actions are enabled for the repository.

The workflow at `.github/workflows/publish.yml` requests `contents: write` to
create the GitHub Release and `id-token: write` for trusted publishing. It
installs npm 11.5.1 or newer, as required for trusted publishing. The OIDC
permission lets npm verify the GitHub Actions identity and generate provenance
for the published package.

## Release later versions

Run these from a clean `main` checkout after the release changes are merged.

```bash
npm ci
npm test
npm run build
npm version <major|minor|patch>
git push origin main --follow-tags
```

`npm version` updates `package.json` and `package-lock.json`, creates a commit,
and creates a `v<version>` tag. Review the generated commit before pushing.

Pushing the tag starts the `Publish npm package` workflow. It checks out that
immutable tag, verifies the tag matches `package.json`, installs from the
lockfile, runs tests and the production build, then creates a draft GitHub
Release with generated notes. It publishes `ompweb` through the configured
trusted publisher and makes that release public only after npm accepts the
package. A rerun can safely finish a release if npm has already accepted its
version.

## Verify

```bash
gh run list --repo kahme247/ompweb --workflow publish.yml --limit 1
npm view @kahme247/ompweb@<version> version --registry https://registry.npmjs.org/
npm view @kahme247/ompweb@<version> --json --registry https://registry.npmjs.org/
```

Confirm the workflow succeeded, the exact package version resolves, and npm
shows the expected provenance link.


## Install (>= 0.3.0)

The recommended install path is a single one-liner. The npm package no
longer auto-installs `omp` on `npm install -g` (no `postinstall` for
supply-chain safety — D1).

**macOS / Linux:**

    curl -fsSL https://raw.githubusercontent.com/lucaspdude/ompweb/main/scripts/install.sh | sh

**Windows (PowerShell):**

    irm https://raw.githubusercontent.com/lucaspdude/ompweb/main/scripts/install.ps1 | iex

Both scripts:

1. Detect OS / arch.
2. Ensure Node.js >= 22.19.0.
3. Install `omp` by delegating to `https://omp.sh/install` (the official
   oh-my-pi installer). Skipped if `omp` is already on `PATH`.
4. Smoke-test `omp --version` (mandatory — see the `install-smoke.yml`
   workflow for the CI equivalent).
5. Install `@lucaspdude/rocinante` via `npm install -g --ignore-scripts`.
6. Print `Run 'rocinante' to start.`

If the user skips the script and runs `npm install -g
@lucaspdude/rocinante` directly, the launcher detects the missing
`omp` and prints a hint (the onboarding modal — Phase 2 — is the
graphical equivalent).

## File renames (>= 0.3.0)

- `bin/omp-web.js` → `bin/rocinante.js` (D2). The launcher now probes
  for `omp` and prints a hint when it's missing, instead of failing
  silently.
- New `lib/rocinante/rocinante-cli-core.js` (CJS) holds the omp-probe
  logic that the launcher requires at install time (no TS transpile).
- `lib/rocinante/rocinante-cli.ts` (TS facade) re-exports the CJS
  core with the async `getOmpVersion` and TTL cache.
- `lib/omp/omp-cli.ts` now re-exports from `lib/rocinante/rocinante-cli`
  for backward compat (every existing
  `import { resolveOmpBin } from "@/lib/omp/omp-cli"` call site
  keeps working).

## CI

`.github/workflows/install-smoke.yml` runs the install script
matrix-style on `ubuntu-latest`, `macos-latest`, and `windows-latest`.
Each job boots the runner, runs the appropriate script, then
verifies `omp` and `rocinante` are on `PATH` and `package.json#bin`
points at `bin/rocinante.js`.
