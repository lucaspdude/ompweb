import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { replaceOrAppendBlock, removeBlock, renderHostBlock, appendBlock } = await jiti.import("./config.ts");

function withTempConfig(fn) {
  const dir = mkdtempSync(join(tmpdir(), "roc-ssh-"));
  const path = join(dir, "config");
  try {
    return fn({ dir, path });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("replaceOrAppendBlock creates the file when missing", () => {
  withTempConfig(({ path }) => {
    const block = renderHostBlock("github.com", [
      { key: "HostName", value: "github.com" },
      { key: "User", value: "git" },
      { key: "IdentityFile", value: "/home/u/.ssh/id_ed25519_github" },
      { key: "IdentitiesOnly", value: "yes" },
    ]);
    replaceOrAppendBlock(path, "Host github.com", block);
    const text = readFileSync(path, "utf8");
    assert.ok(text.includes("Host github.com"));
    assert.ok(text.includes("IdentityFile /home/u/.ssh/id_ed25519_github"));
  });
});

test("replaceOrAppendBlock replaces an existing block in place", () => {
  withTempConfig(({ path }) => {
    writeFileSync(path, "# existing comment\n\nHost github.com\n    HostName github.com\n    User git\n    IdentityFile /old/path\n    IdentitiesOnly yes\n\nHost other\n    HostName other.example\n");
    const block = renderHostBlock("github.com", [
      { key: "HostName", value: "github.com" },
      { key: "User", value: "git" },
      { key: "IdentityFile", value: "/new/path" },
      { key: "IdentitiesOnly", value: "yes" },
    ]);
    replaceOrAppendBlock(path, "Host github.com", block);
    const text = readFileSync(path, "utf8");
    assert.ok(text.includes("/new/path"), "new IdentityFile is present");
    assert.ok(!text.includes("/old/path"), "old IdentityFile is gone");
    assert.ok(text.includes("Host other\n"), "unrelated block is preserved");
    assert.ok(text.includes("# existing comment"), "leading comment is preserved");
  });
});

test("removeBlock deletes the matching Host block", () => {
  withTempConfig(({ path }) => {
    writeFileSync(path, "Host github.com\n    IdentityFile /x\n\nHost other\n    IdentityFile /y\n");
    removeBlock(path, "Host github.com");
    const text = readFileSync(path, "utf8");
    assert.ok(!text.includes("Host github.com"), "github.com block removed");
    assert.ok(text.includes("Host other"), "other block preserved");
  });
});

test("appendBlock creates the file with a trailing newline", () => {
  withTempConfig(({ path }) => {
    appendBlock(path, "Host foo\n    HostName foo.example\n");
    const text = readFileSync(path, "utf8");
    assert.ok(text.endsWith("\n"));
    assert.ok(text.includes("Host foo"));
  });
});

test("renderHostBlock omits the Port directive when 22", () => {
  const block = renderHostBlock("prod", [
    { key: "HostName", value: "prod.example" },
    { key: "User", value: "deploy" },
  ]);
  assert.ok(!block.includes("Port"));
  assert.ok(block.includes("HostName prod.example"));
});

test("renderHostBlock includes the Port directive when non-default", () => {
  const block = renderHostBlock("prod", [
    { key: "HostName", value: "prod.example" },
    { key: "User", value: "deploy" },
    { key: "Port", value: "2222" },
  ]);
  assert.ok(block.includes("Port 2222"));
});

test("replaceOrAppendBlock tolerates a file without trailing newline", () => {
  withTempConfig(({ path }) => {
    writeFileSync(path, "Host other\n    IdentityFile /y");
    const block = renderHostBlock("github.com", [
      { key: "HostName", value: "github.com" },
      { key: "User", value: "git" },
      { key: "IdentityFile", value: "/x" },
    ]);
    replaceOrAppendBlock(path, "Host github.com", block);
    const text = readFileSync(path, "utf8");
    assert.ok(text.includes("Host github.com"));
    assert.ok(text.includes("Host other"));
  });
});

test("removeBlock is a no-op when the file does not exist", () => {
  withTempConfig(({ path }) => {
    removeBlock(path, "Host github.com");
    assert.equal(existsSync(path), false);
  });
});
