# Rocinante

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Local web UI for the [oh-my-pi (omp) coding agent](https://github.com/can1357/oh-my-pi). Rocinante reads your local omp session files and gives you a browser workspace for session browsing, real-time chat, model configuration, skill management, project file preview, and one-click tooling for the agent (CLIs, Git SSH keys, SSH server connections).

![Rocinante — light theme](docs/screenshot-light.png)

<details>
<summary>Dark theme</summary>

![Rocinante — dark theme](docs/screenshot-dark.png)

</details>

## Requirements

- [omp](https://github.com/can1357/oh-my-pi) installed and on your `PATH` (or point `ROCINANTE_OMP_BIN` at the binary)
- Node.js 22.19.0 or newer (`node --version`)

## Quick Start

**One-line install** (recommended — installs `omp` and the `rocinante`
package in a single shot):

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/lucaspdude/rocinante/main/scripts/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/lucaspdude/rocinante/main/scripts/install.ps1 | iex
```

The installer generates a random `ROCINANTE_SECRET` and stores it in
`${SHARE_DIR}/.env` (chmod 600). The UI starts in **open** mode
(`ROCINANTE_AUTH_ENABLED=false`); the first-run wizard offers a
one-click toggle to require a key. See **Access-key protection** below.

Then start the server:

```bash
rocinante
# Opens http://127.0.0.1:30178 (or your --port override) in the default browser.
```

Useful flags / overrides:

```bash
rocinante --port 8080           # custom port
ROCINANTE_HOSTNAME=0.0.0.0 rocinante # explicit network exposure
ROCINANTE_NO_OPEN=1 rocinante   # useful when running as a background service
```

### Access-key protection

The installer writes a random 32-byte secret to `${SHARE_DIR}/.env`
alongside the package. To lock the UI behind a key:

1. Complete the first-run onboarding wizard (toggle on the "Protect
   access?" step), **or** flip `ROCINANTE_AUTH_ENABLED=true` in
   `${SHARE_DIR}/.env` and restart.
2. The server flips the flag in place; copy the one-time secret the
   onboarding modal shows (or read it from the `.env` file).
3. Open the UI — the `/login` page asks for the key. Sessions are
   cookies (HttpOnly, SameSite=Strict), valid for 24h with a 7-day
   hard cap. Settings → Security can rotate the key (signs out
   everyone) or revoke individual sessions.

The token format is documented in
`docs/finished/2026-08-13-access-key-protection.md` (after the feature
lands). The legacy `ROCINANTE_PASSWORD` Basic Auth path has been
removed; environment variables with that name are silently ignored.

### Security and troubleshooting

- The server binds to `127.0.0.1` by default. A non-loopback hostname is an explicit opt-in and should only be used behind a trusted network boundary; Rocinante is not safe to expose publicly.
- File APIs are allow-listed to the selected workspace, its valid Git worktrees, session-referenced directories, and explicitly selected roots. Paths are canonicalized to reject traversal and symlink escapes.
- `omp` is resolved from `ROCINANTE_OMP_BIN` first, then `PATH`. If live chat cannot start, run `omp --version` in the same terminal or set `ROCINANTE_OMP_BIN` to the executable's absolute path. The install script offers a hint when `omp` is missing on first launch.
- Session history remains native OMP JSONL. OMP owns live-session writes; Rocinante reads the files directly and only performs explicit title, archive, and delete maintenance when it is not racing a live OMP write.
- Session archive uses OMP's native `archive/sessions/<cwd>/<file>.jsonl.gz` layout and moves sibling artifacts with the transcript; the original JSONL bytes are preserved inside the gzip.

## Features

Grouped by intent (5 themes). The UI is dense; this is the surface area
of the fork.

### Stay in flow

- **Pick work back up**: browse previous omp conversations by project without digging through terminal history or session paths.
- **Try different directions safely**: continue from an earlier message or fork a session into a separate route.
- **Work across branches**: switch Git worktrees from the sidebar so new sessions and the Explorer follow the checkout you choose.
- **Jump anywhere with ⌘K**: a command palette (⌘K / Ctrl+K) for switching sessions, starting new ones, and toggling the theme.

### See what changed

- **Right sidebar — Files & Changes**: vertical tab with a file tree, an open-file viewer, and a Git changes panel; drag the rail to resize.
- **First-run onboarding**: 5-step wizard (welcome → protect access → providers → model → done) that creates `~/.omp/agent/`, picks a default provider, and seeds the model catalog.

### Tune the agent

- **Models + native OMP controls**: advisor, approval, Bash policy, thinking level, compaction, memory, auto-learn, retry/fallback — all editable from the web UI.
- **MCP management in Settings**: a dedicated MCP tab lists installed project servers with status (enabled / disabled / invalid), supports add/edit/rename/validate/remove, and surfaces configuration failures as corner toasts.
- **Skills & plugins**: list installed skills, search the registry, update in place.
- **Keep OMP current**: check the installed runtime version, update it, and restart active sessions from Settings when needed.

### Stay organized

- **Custom projects sidebar**: register any folder as a project, pin a default, reorder, archive. State persists across sessions.
- **Session archive / delete**: archive an inactive session without deleting its native transcript, or delete it explicitly.
- **Stay informed**: opt into browser notifications when an agent finishes, and check installed skills for updates.

### Ship faster

- **Install scripts**: `curl | sh` on Unix, `irm | iex` on Windows — sets up `omp` + Rocinante in a single shot and seeds the access-key secret.
- **Developer tools** (Settings → Developer tools):
  - **CLIs**: install + sign in to **Azure CLI** (`az`) and **GitHub CLI** (`gh`) without leaving the UI. Live log + device-code capture.
  - **Git SSH keys**: generate `ed25519` keys for GitHub, GitLab, and Azure DevOps; the UI pastes the public key on the provider's site, tests the connection, and stores the private key in `~/.ssh/` with the matching `Host` block in `~/.ssh/config`.
  - **SSH server connections**: register generic SSH servers (alias + host + user + port + key) the same way. Public-key auth only; password auth is documented as a v1 limitation.
- **Access-key protection**: opt-in UI lock behind an HMAC-signed token cookie, with rotation and per-session revoke.
- **Multi-language UI**: English, Brazilian Portuguese, Japanese, Simplified Chinese.

## Configuration

Rocinante reads its configuration from the `${SHARE_DIR}/.env` file
(written by the installer) plus process environment variables.

| Variable | Meaning |
| --- | --- |
| `ROCINANTE_OMP_BIN` | Absolute path to the `omp` binary (overrides `PATH` lookup). |
| `ROCINANTE_PORT` | UI port (overrides `--port`). |
| `ROCINANTE_HOSTNAME` | Bind address (overrides `--hostname`). |
| `ROCINANTE_NO_OPEN` | `1` to skip the auto-open browser step. |
| `ROCINANTE_PACKAGE_DIR` | Set automatically by the launcher. |
| `ROCINANTE_LAUNCHER_PID` | Set automatically by the launcher. |
| `ROCINANTE_SECRET` | Access-key secret. Written by the installer; flip `ROCINANTE_AUTH_ENABLED` to `true` to require it. |
| `ROCINANTE_AUTH_ENABLED` | `true` to require a login on every request. Toggled from the onboarding wizard or Settings → Security. |
| `PORT` | Server port (default `30177`; `-p/--port` wins). |
| `OMP_WEB_OMP_BIN` | Alias for `ROCINANTE_OMP_BIN`; kept for backward compatibility with the upstream `ompweb` install. |
| `PI_CODING_AGENT_DIR` | Point at another omp agent directory (default `~/.omp/agent`). |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | Standard proxy variables for server-side requests. |

## Architecture

Rocinante is a Node-hosted Next.js app that drives your installed `omp` binary — it does not embed the agent:

- **Live sessions**: spawns `omp --mode rpc-ui` (NDJSON over stdio), one child process per active session, so the agent version is always exactly what you have installed. It negotiates RPC v2 when the installed OMP advertises it, uses bounded chunk reassembly for large frames, and falls back to v1 for older versions.
- **Session browsing**: reads omp's session files (`~/.omp/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`) directly; title, archive, and delete are narrow native-file maintenance operations guarded against live OMP writes.
- **Access-key protection**: every request flows through `proxy.ts`, which verifies an HMAC-SHA256 token cookie against a secret loaded from `.env`. On HTTPS the cookie is `Secure`; otherwise it relies on `HttpOnly` + `SameSite=Strict`.
- **CLI install / login**: subprocess-based. The install route spawns the platform's package manager (`brew` / `apt` / `winget`); the login route captures the device-code URL + token via regex on the child's stdout/stderr and streams progress over SSE. The `gh` flow's "press Enter to start polling" gotcha is handled by an `/ack` endpoint that writes `"\n"` to stdin.
- **Git SSH keys & SSH servers**: per-provider recipes in `lib/ssh/`. Keys are `ed25519` with `chmod 600`; config blocks use `IdentitiesOnly yes` to avoid max-auth-retries failures. The user adds the public key to their provider's settings, then the UI runs `ssh -T -o BatchMode=yes` to verify.

## Development

```bash
git clone https://github.com/lucaspdude/rocinante
cd ompweb
npm install
npm run dev          # http://127.0.0.1:30178

npm test             # node --test
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

`omp` is launched as a child process — make sure the binary is
discoverable (`PATH` or `ROCINANTE_OMP_BIN`) before opening a live
session. The dev server does not require `omp`; the UI shows a hint
until it's available.

## Internationalization

Rocinante ships with 4 locales: **English** (`en.json`, canonical),
**Brazilian Portuguese** (`pt-BR.json`), **Japanese** (`ja.json`),
and **Simplified Chinese** (`zh-CN.json`). All four are kept in lockstep
via the parity test (`lib/i18n-parity.test.mjs`) — adding a key in `en`
without adding it in the other three fails `npm test`.

Switch locale from the language picker in the top bar; the choice
persists in `localStorage` and a same-name cookie (so server-rendered
content can be pre-hydrated in the right language).

## Quality

- 309 unit tests across `lib/` + `components/` (Node's built-in
  `node:test` runner; no third-party test framework).
- TypeScript strict mode, `tsc --noEmit` clean.
- ESLint clean (zero errors; warnings are pre-existing in
  `lib/rocinante/*.js` files that we don't touch).
- i18n parity enforced on every commit.
- Smoke workflow: `install-smoke.yml` exercises `install.sh` on
  Linux + macOS and `install.ps1` on Windows across pushes and PRs.

## Credits

Rocinante is a fork of [agegr/pi-web](https://github.com/agegr/pi-web)
(originally the web UI for the [pi-mono](https://github.com/badlogic/pi-mono)
coding agent) re-targeted at [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi)
(omp), then re-branded and re-shaped by [lucaspdude](https://github.com/lucaspdude).
The underlying `omp` binary is a separate product by the oh-my-pi
maintainer; Rocinante only drives it via RPC.

UI primitives are built on [@base-ui/react](https://base-ui.com) (MIT)
and [lucide-react](https://lucide.dev) (ISC).

## License

MIT
