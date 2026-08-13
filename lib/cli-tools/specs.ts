import type { CliId, CliSpec } from "./types";

// Per-CLI install + login specs. Each entry is a self-contained recipe
// for the 3 supported platforms (mac/linux/win). The login regexes
// below are matched against the spawn output (stderr for `az`, stdout
// for `gh`); they capture the device-code URL + code so the UI can
// surface them to the user.
//
// The `az` regex tolerates the message ordering in newer builds where
// the URL is printed before the code; `gh` prints them on separate
// lines in a fixed order, so two simpler regexes work.

export const CLIS: Record<CliId, CliSpec> = {
  az: {
    id: "az",
    displayName: "Azure CLI",
    helpText: "Azure CLI gives the agent access to your Azure resources.",
    install: {
      mac: ["brew", "install", "azure-cli"],
      linux: ["sh", "-c", "curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash"],
      win: ["winget", "install", "--exact", "--id", "Microsoft.AzureCLI"],
    },
    verifyInstall: ["az", "--version"],
    verifyAuth: ["az", "account", "show", "--output", "none"],
    accountQuery: ["az", "account", "show", "--query", "user.name", "-o", "tsv"],
    loginCmd: ["az", "login", "--use-device-code"],
    loginStream: "stderr",
    loginUrlRegex: /(https:\/\/microsoft\.com\/devicelogin)/,
    loginCodeRegex: /(?:enter the code\s+)([A-Z0-9]+)/i,
    needsStdinAck: false,
    loginTimeoutSeconds: 15 * 60,
  },
  gh: {
    id: "gh",
    displayName: "GitHub CLI",
    helpText: "GitHub CLI lets the agent open PRs, fetch issues, and call the GitHub API.",
    install: {
      mac: ["brew", "install", "gh"],
      linux: ["sh", "-c", "type -p curl >/dev/null || (sudo apt update && sudo apt install -y curl); curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg; echo \"deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null; sudo apt update && sudo apt install -y gh"],
      win: ["winget", "install", "--id", "GitHub.cli", "--source", "winget"],
    },
    verifyInstall: ["gh", "--version"],
    verifyAuth: ["gh", "auth", "status"],
    accountQuery: ["gh", "api", "user", "--jq", ".login"],
    loginCmd: ["gh", "auth", "login", "--no-browser", "--git-protocol", "ssh"],
    loginStream: "stdout",
    loginUrlRegex: /(https:\/\/github\.com\/login\/device)/,
    loginCodeRegex: /(?:one-time code:\s*)([A-Z0-9-]+)/,
    needsStdinAck: true,
    loginTimeoutSeconds: 15 * 60,
  },
};

export function getSpec(id: string): CliSpec | null {
  if (id === "az" || id === "gh") return CLIS[id];
  return null;
}
