# Changelog

All notable changes to Rocinante are documented here. Versions follow
[SemVer](https://semver.org/). The upstream `omp` (oh-my-pi) binary is
a separate product; release notes for it live at
<https://github.com/can1357/oh-my-pi/releases>.

## [Unreleased]

## [0.3.0] — 2026-08-13

### Added

- **Right sidebar (Files + Changes)** — new tabbed sidebar replacing
  the old file-only panel. Three discrete width states
  (`collapsed=44px`, `default=360px`, `wide=540px`) persisted to
  `localStorage` under `rocinante:right-sidebar-state`.
  - **Files tab**: hosts the `FileExplorer` (moved from the left
    sidebar), `TabBar`, and `FileViewer` in a single column.
  - **Changes tab**: per-repo Git status via the new
    `GET /api/git/repos?cwd=` endpoint, with collapsible sections
    and copy-friendly status badges.
  - **Tree-node context menu**: copy name / path / relative path,
    delete (with `ConfirmDialog` + recursive confirm for non-empty
    dirs), rename (inline input dialog), new file / new folder.
  - New file API verbs: `DELETE /api/files/<path>` (single file or
    recursive dir), `PATCH /api/files/<path>` (rename via
    `{"name": ...}`), `POST /api/files/<path>?type=mkdir` and
    `?type=touch`.
- **Install packaging + first-run onboarding** — single-line install
  UX for new users plus a guided 5-step setup wizard on first run.
  - `scripts/install.sh` (macOS/Linux) and `scripts/install.ps1`
    (Windows) — Node check → `omp` install via
    `https://omp.sh/install` → `omp --version` smoke test →
    `npm install -g --ignore-scripts @lucaspdude/rocinante` → friendly
    next-steps message. **No npm `postinstall`** (D1).
  - `.github/workflows/install-smoke.yml` — matrix CI smoke test on
    `ubuntu-latest`, `macos-latest`, `windows-latest`.
  - `bin/omp-web.js` → `bin/rocinante.js` (D2). The launcher now
    probes for `omp` and prints a friendly install hint when the
    binary is missing.
  - `lib/rocinante/rocinante-cli-core.js` (CJS) + `lib/rocinante/
    rocinante-cli.ts` (TS facade) — the omp-probe code lives in the
    `rocinante/` namespace; `lib/omp/omp-cli.ts` is a backward-compat
    re-export shim.
  - Onboarding modal (D3, D10, D11, D12): `Welcome` →
    `Verify omp` → `Init agent folder` → `Choose provider` →
    `Default model` → `Done`. Blocking on first run; re-runnable
    from the topbar **Run setup wizard** button or the Settings
    header. Resume from `localStorage["rocinante:onboarding-step"]`.
  - `lib/omp/oauth-providers.ts` (D14) — snapshot of upstream OAuth
    provider IDs grouped by callback vs. login-paste-key.
  - 67-key `onboarding.*` i18n namespace + 31-key `rightSidebar.*`
    namespace, added to all four locales (en, pt-BR, ja, zh-CN).
  - `package.json#bin` repointed at `bin/rocinante.js`. The shipped
    npm package no longer auto-installs `omp` on `npm install -g`
    (the script does that explicitly).

### Changed

- README quickstart rewritten around the `curl | sh` one-liner;
  package and GitHub URLs rebrand from `kahme247/ompweb` →
  `lucaspdude/ompweb`; env-var prefix renamed from `OMP_WEB_*` →
  `ROCINANTE_*`. `docs/release.md` gains the standalone-install
  contract and the file-rename note for the next release.
- `lib/omp/omp-cli.ts` is now a re-export shim pointing at
  `lib/rocinante/rocinante-cli.ts` — every existing
  `import { resolveOmpBin } from "@/lib/omp/omp-cli"` call site keeps
  working.

### Fixed

- AGENTS.md section "Layout" now reflects the post-feature
  `.right-sidebar-container` (rail + content) instead of the
  retired `.right-panel-container`.

## [0.2.6] — 2026-08-12 and earlier

See `git log` for the pre-0.3.0 history.
