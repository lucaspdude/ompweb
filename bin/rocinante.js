#!/usr/bin/env node
"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getUnsupportedNodeVersionMessage, isNodeVersionSupported } = require("./node-version");

if (!isNodeVersionSupported(process.versions.node)) {
  console.error(getUnsupportedNodeVersionMessage(process.versions.node));
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseLaunchOptions } = require("./rocinante-options");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isPortAvailable } = require("./port-availability");

// Probe for the upstream `omp` binary before we even start next. Rocinante
// is a web shell for `omp` (the oh-my-pi agent); without it, live sessions
// fail. The check is best-effort: we print a hint but still start the
// server so the user can read the onboarding modal.
let ompBin = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ompBin = require("../lib/rocinante/rocinante-cli-core.js").findOmpBin();
} catch (_) {
  // Core missing or threw — leave ompBin null and fall through to the hint.
}
if (!ompBin) {
  console.error("⚠  omp not found on PATH or in usual install locations.");
  console.error("   Install it with:    curl -fsSL https://omp.sh/install | sh");
  console.error("   Or set:             ROCINANTE_OMP_BIN=/path/to/omp");
  console.error("   Rocinante will start, but live sessions will fail until omp is available.");
}

const pkgDir = path.join(__dirname, "..");
const nextDir = path.join(pkgDir, ".next");

// Resolve next's CLI entry directly to avoid relying on .bin symlinks (which
// may not exist when installed via npx).
let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next", { paths: [pkgDir] });
} catch {
  // Fallback: locate next package root and derive the bin path manually.
  try {
    const nextPkg = require.resolve("next/package.json", { paths: [pkgDir] });
    nextBin = path.join(path.dirname(nextPkg), "dist", "bin", "next");
  } catch {
    nextBin = path.join(pkgDir, "node_modules", "next", "dist", "bin", "next");
  }
}

const { port, hostname, openBrowser } = parseLaunchOptions();
const loopbackHostnames = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

if (!fs.existsSync(nextDir)) {
  console.error("Build artifacts not found. Please report this issue.");
  process.exit(1);
}

if (!loopbackHostnames.has(hostname)) {
  console.warn(
    `Warning: Rocinante is listening on ${hostname} without authentication. Only use this on a trusted network.`,
  );
}

const nextArgs = ["start", "-p", port];
nextArgs.push("-H", hostname);

// Always run next's JS entry with node directly — avoids .bin symlink issues
// and path-with-spaces problems on Windows when shell: true is used.
const url = `http://${hostname}:${port}`;

async function main() {
  if (!(await isPortAvailable(port, hostname))) {
    // Some previous incarnation crashed and left the next-server holding
    // the port (or the user double-launched). Try to kill the occupant
    // SIGKILL and re-check; if still busy, give up like before.
    // Addresses the restart-loop where the launcher kept seeing the
    // port "in use" and died with status 1, while the orphan next-server
    // stayed alive. fuser runs sudo-lessly as root in the harness LXC.
    console.error(`Port ${port} on ${hostname} is in use; trying to free it.`);
    // Some previous incarnation crashed and left the next-server holding
    // the port (or the user double-launched). Try to free the port with
    // a couple of fallbacks: pkill (always available on Linux), then
    // fuser (Debian/Ubuntu utility, optional), then ss. Addresses the
    // restart-loop where the launcher kept seeing the port "in use" and
    // died with status 1, while the orphan next-server stayed alive.
    console.error(`Port ${port} on ${hostname} is in use; trying to free it.`);
    const { execFileSync } = require("node:child_process");
    const candidates = [
      ["pkill", ["-TERM", "-f", `next-server.*${port}`]],
      ["fuser", ["-k", "-TERM", `${port}/tcp`]],
    ];
    for (const [cmd, args] of candidates) {
      try {
        execFileSync(cmd, args, { stdio: "ignore" });
        console.error(`Tried ${cmd} ${args.join(" ")}.`);
        break;
      } catch (catcherError) {
        console.error(`${cmd} not available or failed: ${catcherError.message}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (!(await isPortAvailable(port, hostname))) {
      console.error(`Port ${port} on ${hostname} is still in use.`);
      console.error(`If Rocinante is already running, open ${url}. Otherwise, stop the process using it or run: rocinante --port ${Number(port) + 1}`);
      process.exitCode = 1;
      return;
    }
    console.error(`Port ${port} freed; starting.`);
  }

  const child = spawn(process.execPath, [nextBin, ...nextArgs], {
    cwd: pkgDir,
    stdio: ["inherit", "pipe", "inherit"],
    env: {
      ...process.env,
      ROCINANTE_PACKAGE_DIR: pkgDir,
      ROCINANTE_LAUNCHER_PID: String(process.pid),
      ROCINANTE_PORT: port,
      ROCINANTE_HOSTNAME: hostname,
    },
  });

  let browserOpened = false;
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    if (openBrowser && !browserOpened && text.includes("Ready")) {
      browserOpened = true;
      const isWindows = process.platform === "win32";
      const isMac = process.platform === "darwin";
      const openCmd = isWindows ? "explorer.exe" : isMac ? "open" : "xdg-open";
      const opener = spawn(openCmd, [url], {
        stdio: "ignore",
        detached: true,
      });

      opener.on("error", (error) => {
        console.warn(`Could not open browser automatically: ${error.message}`);
      });

      opener.unref();
    }
  });

  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  child.on("exit", (code, signal) => {
    console.error(`launcher: next exited with code=${code}, signal=${signal ?? "none"}, uptime=${process.uptime().toFixed(1)}s`);
    process.exit(code ?? 0);
  });
  // Ensure SIGTERM is acted on immediately when systemd sends it. Without
  // this handler, the default Node.js action runs but the launcher can
  // get stuck in the middle of a long synchronous operation (e.g. a
  // blocked stdout write from a misbehaving child) and miss the
  // TimeoutStopSec=20s, ending up SIGKILLed by systemd and triggering
  // a noisy restart loop. The handler forces an immediate clean exit.
  process.on("SIGTERM", () => {
    console.error(`launcher: received SIGTERM, exiting`);
    process.exit(0);
  });
  process.on("SIGINT", () => {
    console.error(`launcher: received SIGINT, exiting`);
    process.exit(0);
  });
  process.on("SIGHUP", () => {
    console.error(`launcher: received SIGHUP, exiting`);
    process.exit(0);
  });
 }
