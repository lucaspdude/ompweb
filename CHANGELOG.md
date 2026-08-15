# Changelog

All notable changes to Rocinante are documented here. Versions follow
[SemVer](https://semver.org/). The upstream `omp` (oh-my-pi) binary is
a separate product; release notes for it live at
<https://github.com/can1357/oh-my-pi/releases>.
## [0.4.12] - 2026-08-15T01:13:09Z

### Changed

- Auto-bumped patch version after PR merge.

## [0.4.11] - 2026-08-15T00:57:43Z

### Changed

- Auto-bumped patch version after PR merge.

## [0.4.10] - 2026-08-14T23:58:51Z

### Changed

- Auto-bumped patch version after PR merge.

## [0.4.9] - 2026-08-14T23:40:48Z

### Changed

- Auto-bumped patch version after PR merge.

## [0.4.8] - 2026-08-14T23:02:17Z

### Changed

- Auto-bumped patch version after PR merge.

## [0.4.7] - 2026-08-14T22:43:58Z

### Changed

- Auto-bumped patch version after PR merge.

## [0.4.6] — 2026-08-14

### Fixed

- **\`systemd\` user service entered a restart loop with exit 127
  on NVM hosts** because the unit's \`ExecStart\` used the JS path
  (with a \`#!/usr/bin/env node\` shebang); systemd invokes the
  service via \`/bin/sh\`, which falls back to \`env node\`, but
  systemd's minimal service PATH doesn't include
  \`~/.nvm/versions/node/vX.Y.Z/bin\` so \`env node\` can't find
  node. Resolve \`node\` at install time (\`command -v node\`) and
  write the absolute path into \`ExecStart\`. Also set
  \`Environment=PATH=\${PATH}\` in the unit + the \`PATH\` env in
  the launchd plist so the launcher's subprocesses (\`omp\`, \`az\`,
  etc.) inherit a usable PATH.

## [0.4.5] — 2026-08-13

### Fixed

- **\`/login\` page triggered Next.js 16's static pre-render abort**
  (\`useSearchParams() should be wrapped in a suspense boundary\`)
  because the form reads \`?next=\` from the URL. The abort routes the
  install through the dev-fallback branch, and the symlink ends up
  pointing at the dev server, not the production build. Wrap the
  form in \`<Suspense>\` so Next can statically pre-render the shell.

## [0.4.5] — 2026-08-13

### Added

- **\`scripts/install.sh\` now installs Rocinante as a background
  service** that auto-starts on boot and auto-restarts on crash:
  - Linux: writes \`~/.config/systemd/user/rocinante.service\` with
    \`Type=simple\`, \`Restart=always\`, \`RestartSec=5\`, and an
    \`EnvironmentFile=-\${SHARE_DIR}/.env\` so the existing secret
    is loaded. If a systemd user manager is reachable, also
    \`daemon-reload\` + \`enable\` + \`restart\`.
  - macOS: writes
    \`~/Library/LaunchAgents/com.lucaspdude.rocinante.plist\` with
    \`RunAtLoad=true\` + \`KeepAlive=true\`.
  - Set \`ROCINANTE_INSTALL_SERVICE=0\` to opt out (e.g. on CI).
- **\`/usr/local/bin\` symlink.** Default \`~/.local/bin\` is not on
  PATH for non-interactive login shells, so the install now also
  links into \`/usr/local/bin\` (always on PATH on Linux + macOS).
  \`rocinante\` works out-of-the-box after install with no manual
  \`.bashrc\` edit.

### Changed

- The success banner now reads \${ROCINANTE_PORT} (was hardcoded to
  the dev port 30178). Production default is 30177.

## [0.4.4] — 2026-08-13

### Fixed

- **\`app/api/security/sessions/route.ts\` exported \`registerSession\`**
  so the auth login route could call it. Next.js 16's strict route
  type-check rejects any export other than GET/POST/PUT/DELETE/PATCH/
  HEAD/OPTIONS + the \`config\`/\`dynamic\`/\`revalidate\` flags, so
  the build aborts with \`Property 'registerSession' is incompatible
  with index signature\`. That error routes the install through the
  dev-fallback branch and the symlink target ends up pointing at the
  dev server, not the production build. Move the session map +
  \`registerSession\` to a new \`lib/security-sessions.ts\` (with the
  shared \`ActiveSession\` type in \`lib/auth-token-types.ts\`) and
  re-import from the auth login route. The sessions route is now a
  pure route file.

Verified end-to-end on the harness host: a clean install of v0.4.3
completes \`next build\` without errors, writes the production
bundle to \`.next/\`, and links the production launcher.

## [0.4.2] — 2026-08-13

### Fixed

- **\`install.sh --omit=dev\` skipped devDependencies needed by \`next build\`**
  (\`@tailwindcss/postcss\`, typescript chain). The resulting
  \`Cannot find module '@tailwindcss/postcss'\` error combined with the
  pre-existing font CDN failure routed every clean install through the
  dev-fallback branch — the symlink then pointed at the dev server
  instead of the production build, so the UI never rendered. Drop
  \`--omit=dev\` from the install \`npm ci\`.
- **\`/api/cli-tools/[id]/login/stream\` used \`maxDuration = 60 * 30\`**
  (a BinaryExpression). Next.js 16's route config parser only accepts
  literal numbers; the build aborted with
  \`Unsupported node type "BinaryExpression" at "maxDuration"\`. Replace
  with literal \`1800\` (30 min × 60 s).

After both fixes a clean install on a fresh host (harness) builds
the production bundle and writes \`.env\` correctly.

## [0.4.1] — 2026-08-13

### Fixed

- **install.sh `seed_env_file` was inside the `cat <<EOF` heredoc** in
  the `Main` function, so the function was never actually defined when
  the build script called it. Result: every install since v0.4.0
  aborted with `seed_env_file: command not found` after a successful
  build. The fix moves the function definition outside the heredoc and
  the call site to just before `main`'s closing `}`. No behavior change
  for the printed output.

## [0.4.0] — 2026-08-13

### Added

- **Access-key protection** — opt-in UI lock behind an HMAC-SHA256 token
  cookie. The installer writes a random `ROCINANTE_SECRET` to
  `${SHARE_DIR}/.env` (chmod 600); the first-run onboarding wizard offers
  a one-click toggle to require the key. Sessions are 24h sliding with a
  7-day hard cap. Settings → Security exposes rotate + per-session revoke.
  Replaces the legacy `ROCINANTE_PASSWORD` HTTP Basic Auth path.
- **CLI installer (Settings → Developer tools → CLIs)** — install and sign
  in to **Azure CLI** and **GitHub CLI** without leaving the UI. Streams
  the install log via SSE and surfaces the device-code URL + token inline.
- **Git SSH keys (Settings → Developer tools → Git SSH keys)** — generate
  `ed25519` keys for GitHub, GitLab, and Azure DevOps, paste the public
  key on the provider's site, and test the connection with
  `ssh -T -o BatchMode=yes`. Matches the private key to the right
  `Host` block in `~/.ssh/config` per provider (with `IdentitiesOnly yes`).
- **SSH server connections (Settings → Developer tools → SSH servers)** —
  register generic SSH servers (alias + host + user + port + key) the
  same way. Public-key auth only; password auth is documented as a
  v1 limitation.
- **Settings → Security tab** — visual UI for the access-key toggle
  (enable / disable / rotate / list active sessions / revoke).
- **Release workflow** — `.github/workflows/release.yml` triggers on
  push to `main`, reads the version from `package.json`, and publishes a
  GitHub Release with auto-generated notes when the tag doesn't exist
  yet. To ship a release, bump `package.json` and merge.

### Changed

- `package.json` URLs now point to `lucaspdude/ompweb` (the fork). The
  `OMP_WEB_OMP_BIN` env var is still accepted as a legacy alias for
  `ROCINANTE_OMP_BIN`.
- `npm start` continues to use port 30177 (Turbopack `npm run dev` uses
  30178). Both are documented.
- README + CONTRIBUTING rebrand to "Rocinante"; the legacy
  `omp-web` identifiers in `localStorage` keys are preserved for
  backward compatibility.

## [0.3.0] — 2026-08-13 (first release)

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
