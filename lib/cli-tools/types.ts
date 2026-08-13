// CLI installer — type definitions. Specs (per-CLI install/login commands)
// live in ./specs.ts; runtime job tracking lives in ./jobs.ts.

export type CliId = "az" | "gh";

export interface CliStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  accountHint: string | null;
  /** Raw stderr/stdout from the last verify call (for debug). */
  detail: string | null;
}

export type CliJobKind = "install" | "login";

export interface CliJob {
  id: string;
  cliId: CliId;
  kind: CliJobKind;
  pid: number;
  status: "running" | "done" | "failed";
  lines: string[];
  startedAt: number;
  exitCode: number | null;
  /** Auth URL + code captured by login flows. */
  authUrl: string | null;
  authCode: string | null;
  child: import("node:child_process").ChildProcess;
}

export interface CliSpec {
  id: CliId;
  displayName: string;
  helpText: string;
  /** Install commands per platform. */
  install: { mac: string[]; linux: string[]; win: string[] };
  /** Run to detect installation. */
  verifyInstall: string[];
  /** Run to detect authentication. */
  verifyAuth: string[];
  /** Run to extract the logged-in user (stdout). */
  accountQuery: string[];
  /** Spawn argv for the login flow (device-code / no-browser). */
  loginCmd: string[];
  /** Which stream the login URL/code arrive on. */
  loginStream: "stderr" | "stdout";
  /** Regex capturing the auth URL. */
  loginUrlRegex: RegExp;
  /** Regex capturing the device code. */
  loginCodeRegex: RegExp;
  /** Whether the flow needs a "\n" on stdin to begin polling (gh quirk). */
  needsStdinAck: boolean;
  /** Per-CLI timeout for the login flow in seconds. */
  loginTimeoutSeconds: number;
}
