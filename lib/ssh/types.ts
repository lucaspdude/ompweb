// SSH feature types. Git providers (Phase 3) and generic servers (Phase 4)
// share this module. Extension lives in lib/ssh/server.ts for ServerSpec.

export type GitProviderId = "github" | "gitlab" | "azureDevops";

export interface GitProviderSpec {
  id: GitProviderId;
  displayName: string;
  /** Host aliases the agent uses (1 for github/gitlab; 2 for azureDevops). */
  hostAliases: string[];
  username: string;
  /** Real hostname for the SSH connection. */
  hostName: string;
  /** SSH user for the test command. */
  sshTestUser: string;
  /** Public-key registration URL (opened in a new tab when the user adds a key). */
  publicKeyUrl: string;
  /** Regex matched against ssh output to extract a "Hi <name>!" line. */
  successRegex: RegExp;
  /** Regex matching the username extraction group. */
  usernameRegex: RegExp;
}

export const GIT_PROVIDERS: Record<GitProviderId, GitProviderSpec> = {
  github: {
    id: "github",
    displayName: "GitHub",
    hostAliases: ["github.com"],
    username: "git",
    hostName: "github.com",
    sshTestUser: "git",
    publicKeyUrl: "https://github.com/settings/ssh/new",
    successRegex: /Hi ([A-Za-z0-9-]+)! You've successfully authenticated/,
    usernameRegex: /Hi ([A-Za-z0-9-]+)!/,
  },
  gitlab: {
    id: "gitlab",
    displayName: "GitLab",
    hostAliases: ["gitlab.com"],
    username: "git",
    hostName: "gitlab.com",
    sshTestUser: "git",
    publicKeyUrl: "https://gitlab.com/-/profile/keys",
    successRegex: /Welcome to GitLab, @?([A-Za-z0-9_.-]+)!/,
    usernameRegex: /Welcome to GitLab, @?([A-Za-z0-9_.-]+)!/,
  },
  azureDevops: {
    id: "azureDevops",
    displayName: "Azure DevOps",
    hostAliases: ["dev.azure.com", "vs-ssh.visualstudio.com"],
    username: "git",
    hostName: "ssh.dev.azure.com",
    sshTestUser: "git",
    publicKeyUrl: "https://dev.azure.com/_usersSettings/keys",
    successRegex: /remote:.*[A-Za-z0-9._-]+/,
    usernameRegex: /([A-Za-z0-9._-]+)@/,
  },
};

export interface GitKeyEntry {
  provider: GitProviderId;
  name: string;
  keyPath: string;
  publicKey: string;
  lastTestAt: number | null;
  lastTestOk: boolean;
  accountHint: string | null;
}

// Phase 4 — generic SSH server spec. Lives in server.ts to keep types
// focused on the shared base.
export interface ServerSpec {
  alias: string;
  hostName: string;
  user: string;
  port: number;
  keyPath: string;
  identityFile: string;
}

export interface ServerConnection {
  alias: string;
  hostName: string;
  port: number;
  user: string;
  keyPath: string;
  lastTestAt: number | null;
  lastTestOk: boolean;
}
