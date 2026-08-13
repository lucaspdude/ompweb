#!/usr/bin/env bash
# Standalone installer for Rocinante on macOS and Linux.
#
# Pipeline:
#   1. Verify Node.js >= 22.19.0 (offer to install if missing).
#   2. Install the upstream `omp` binary via the official oh-my-pi installer
#      (curl -fsSL https://omp.sh/install | sh). Skip when already present.
#   3. Smoke-test the omp binary (`omp --version`).
#   4. Install @lucaspdude/rocinante via npm globally.
#   5. Print a friendly "Run 'rocinante' to start" message.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/lucaspdude/ompweb/main/scripts/install.sh | sh
#   curl -fsSL ... | PI_INSTALL_DIR=$HOME/bin sh   # custom install dir for omp
#   curl -fsSL ... | PI_REF=v17.2.15 sh           # pin a specific omp release
#
# This script is idempotent: re-running it skips the steps that already
# succeeded on the host (omp installed, Rocinante installed).

set -euo pipefail

# ---- Configuration (overridable via env) ----
PI_INSTALL_DIR="${PI_INSTALL_DIR:-$HOME/.local/bin}"
PI_REF="${PI_REF:-}"                # empty = use whatever the upstream installer picks
ROCINANTE_PKG="${ROCINANTE_PKG:-@lucaspdude/rocinante}"
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=19
OMP_INSTALL_URL="https://omp.sh/install"

# ---- Logging ----
log()  { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# ---- 1. Node.js check ----
ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    warn "Node.js not found. Install Node.js >= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR} from https://nodejs.org/ and re-run this script."
    fail "Node.js is required to run Rocinante."
  fi
  local version major minor
  version="$(node -p 'process.versions.node')"
  major="${version%%.*}"
  minor="${version#*.}"; minor="${minor%%.*}"
  if [ "${major}" -lt "${NODE_MIN_MAJOR}" ] \
     || { [ "${major}" -eq "${NODE_MIN_MAJOR}" ] && [ "${minor}" -lt "${NODE_MIN_MINOR}" ]; }; then
    fail "Node.js ${version} is too old. Rocinante requires >= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}."
  fi
  log "Node.js ${version} OK"
}

# ---- 2/3. omp install + smoke test ----
ensure_omp() {
  if PATH="$PI_INSTALL_DIR:$PATH" command -v omp >/dev/null 2>&1; then
    log "omp already on PATH (will reuse)"
  else
    log "Installing omp from ${OMP_INSTALL_URL} into ${PI_INSTALL_DIR}…"
    mkdir -p "$PI_INSTALL_DIR"
    # Delegate to the upstream installer. The installer accepts PI_INSTALL_DIR
    # and PI_REF via env; we just forward them.
    if ! curl -fsSL "$OMP_INSTALL_URL" | PI_INSTALL_DIR="$PI_INSTALL_DIR" ${PI_REF:+PI_REF="$PI_REF"} sh; then
      fail "omp installer failed. See https://github.com/can1357/oh-my-pi#manual-install"
    fi
  fi

  # Ensure PATH includes the install dir for the current shell.
  case ":$PATH:" in
    *":$PI_INSTALL_DIR:"*) ;;
    *) export PATH="$PI_INSTALL_DIR:$PATH" ;;
  esac

  log "Smoke-testing omp --version…"
  if ! version="$(omp --version 2>&1)"; then
    cat <<EOF >&2
The omp binary was downloaded but failed to run. Common causes:
  - libstdc++/libgcc missing (Alpine / minimal containers): install
    'libstdc++' and 'libgcc' via your package manager.
  - macOS: the binary should be universal. Re-download from
    https://omp.sh/install or file an issue with the output of:
      file \$(which omp)
EOF
    fail "omp --version exited non-zero (see hint above)."
  fi
  log "omp ${version} OK"
}

# ---- 4. Rocinante install ----
ensure_rocinante() {
  if command -v rocinante >/dev/null 2>&1; then
    log "rocinante already on PATH (will reinstall to pick up the latest version)"
  fi
  if ! command -v npm >/dev/null 2>&1; then
    fail "npm not found. Install Node.js (which bundles npm) from https://nodejs.org/."
  fi
  log "Installing ${ROCINANTE_PKG} globally…"
  # --ignore-scripts is the npm-recommended defense against postinstall
  # supply-chain attacks. Rocinante has no postinstall by design (D1).
  if ! npm install -g --ignore-scripts "${ROCINANTE_PKG}"; then
    fail "npm install -g ${ROCINANTE_PKG} failed. Check npm logs above."
  fi
}

main() {
  log "Installing Rocinante…"
  ensure_node
  ensure_omp
  ensure_rocinante

  cat <<EOF

\033[1;32m✓\033[0m Rocinante installed.

  Run \033[1m'rocinante'\033[0m to start the web UI.
  The UI opens on http://127.0.0.1:30178 by default.
  Custom port: \033[1mROCINANTE_PORT=4000 rocinante\033[0m
  LAN:          \033[1mnpm install -g ${ROCINANTE_PKG} && npx rocinante-web --lan\033[0m
EOF
}

main "$@"
