# Release Checklist

Rocinante is distributed through **GitHub Releases** — the standalone
install scripts (`scripts/install.sh` and `scripts/install.ps1`)
download the source tarball of the matching tag from
`https://github.com/lucaspdude/rocinante/archive/refs/tags/<tag>.tar.gz`,
build locally, and symlink the launcher. **npm is not in the install
path.**

> **Why not npm?** The original `publish.yml` workflow that published
> `@lucaspdude/rocinante` to npmjs.org kept failing in CI on
> `next/font/google` font fetches (`fonts.gstatic.com` is blocked from
> the GitHub Actions runner). Distributing via GitHub Releases removes
> the npm publish dependency entirely: the build still happens, just
> on the user's machine where they have normal internet.

Each release creates:

- **GitHub Release** (auto-archives the source for every tag)
- **Git tag** (`v<version>`) for the install script to pin to

## One-time setup (already done)

- The `main` branch is protected; PRs land via squash-merge.
- `.github/workflows/install-smoke.yml` runs the install scripts on
  ubuntu-latest, macos-latest, and windows-latest in CI. The install
  scripts tolerate font fetch failures (they fall back to dev mode if
  `next build` can't reach `fonts.gstatic.com`).

## Release a new version

From a clean `main` checkout, after the release changes are merged:

```bash
# 1. Bump the version in package.json. The install scripts pin to a
#    release tag, so the next user install will pick up the new
#    version automatically.
npm version <major|minor|patch>

# 2. Update CHANGELOG.md with the new version's entry. The PR for
#    that change is what you push and tag.

# 3. Commit + push the version bump (regular feature commits already
#    merged into main).
git push origin main --follow-tags
```

`npm version` updates `package.json` + `package-lock.json`, creates a
commit, and creates a `v<version>` tag. **Review the generated commit
before pushing** (the version bump is a single commit on its own — it
should not pull in feature changes).

Pushing the tag pushes a GitHub Release with the auto-generated source
tarball at `https://github.com/lucaspdude/rocinante/archive/refs/tags/<tag>.tar.gz`.

The install script reads the latest release via the GitHub API
(`/repos/lucaspdude/rocinante/releases/latest`) and downloads the source
tarball, then runs `npm ci` + `npm run build` locally.

> **Optional: ship a prebuilt tarball.** If installs become too slow
> (the `next build` step takes ~30s on a typical laptop), a follow-up
> release can attach a prebuilt artifact (`.next/`, `node_modules/`)
> directly to the GitHub Release. The install script picks whichever
> exists. The `release.yml` workflow (TODO) would handle that build.

## Install (>= 0.3.0)

The recommended install path is a single one-liner that downloads
`omp` (via the official oh-my-pi installer) and builds Rocinante
from the latest GitHub release.

**macOS / Linux:**

    curl -fsSL https://raw.githubusercontent.com/lucaspdude/rocinante/main/scripts/install.sh | sh

**Windows (PowerShell):**

    irm https://raw.githubusercontent.com/lucaspdude/rocinante/main/scripts/install.ps1 | iex

Both scripts:

1. Detect OS / arch.
2. Ensure Node.js >= 22.19.0.
3. Install `omp` by delegating to `https://omp.sh/install` (the official
   oh-my-pi installer). Skipped if `omp` is already on `PATH`.
4. Smoke-test `omp --version` (mandatory).
5. Download the Rocinante source tarball of the latest GitHub
   release (or `ROCINANTE_VERSION=vX.Y.Z` to pin), `npm ci`,
   `npm run build`, symlink `~/.local/bin/rocinante`.
6. Print `Run 'rocinante' to start.`

Pin to a specific version with `ROCINANTE_VERSION=v0.3.0 sh` (or the
PowerShell equivalent `$env:ROCINANTE_VERSION = "v0.3.0"`).

## File renames (>= 0.3.0)

- `bin/omp-web.js` → `bin/rocinante.js`. The launcher now probes for
  `omp` and prints a hint when it's missing.
- New `lib/rocinante/rocinante-cli-core.js` (CJS) holds the omp-probe
  logic the launcher requires at install time (no TS transpile).
- `lib/rocinante/rocinante-cli.ts` (TS facade) re-exports the CJS
  core with the async `getOmpVersion` and TTL cache.
- `lib/omp/omp-cli.ts` now re-exports from
  `lib/rocinante/rocinante-cli` for backward compat.

## CI

`.github/workflows/install-smoke.yml` runs the install scripts on
ubuntu-latest, macos-latest, and windows-latest. Each job boots the
runner, runs the appropriate script, then verifies `omp` and
`rocinante` are on `PATH` and `package.json#bin` points at
`bin/ocinante.js`.
