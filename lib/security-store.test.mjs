import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { readEnvFile, writeEnv, seedEnvFile, generateSecret, getEnvPath, SECRET_KEY, ENABLED_KEY } =
  await jiti.import("./security-store.ts");

function withTempEnvPath(fn) {
  const dir = mkdtempSync(join(tmpdir(), "roc-sec-"));
  const path = join(dir, ".env");
  process.env.ROCINANTE_ENV_PATH = path;
  try {
    return fn({ dir, path });
  } finally {
    delete process.env.ROCINANTE_ENV_PATH;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("generateSecret returns 44-char base64 (32 bytes)", () => {
  const s = generateSecret();
  assert.equal(s.length, 44);
  assert.match(s, /^[A-Za-z0-9+/]+=*$/);
  // Two different invocations yield different output.
  assert.notEqual(s, generateSecret());
});

test("readEnvFile returns hasSecret=false / enabled=false for a missing file", () => {
  withTempEnvPath(({ path }) => {
    const state = readEnvFile(path);
    assert.equal(state.hasSecret, false);
    assert.equal(state.enabled, false);
    assert.equal(state.path, path);
  });
});

test("readEnvFile parses both keys from a written file", () => {
  withTempEnvPath(({ path }) => {
    writeEnv({ secret: "abc123", enabled: true }, path);
    const state = readEnvFile(path);
    assert.equal(state.hasSecret, true);
    assert.equal(state.enabled, true);
  });
});

test("writeEnv creates a file with 0o600 permissions on Unix", { skip: process.platform === "win32" }, () => {
  withTempEnvPath(({ path }) => {
    writeEnv({ secret: "x", enabled: true }, path);
    const text = readFileSync(path, "utf8");
    assert.match(text, new RegExp(`^${SECRET_KEY}=x$`, "m"));
    assert.match(text, new RegExp(`^${ENABLED_KEY}=true$`, "m"));
    const stat = readFileSync(path);
    assert.ok(text.includes(SECRET_KEY));
  });
});

test("seedEnvFile creates a fresh file with enabled=false", () => {
  withTempEnvPath(({ path }) => {
    const result = seedEnvFile(path, { idempotent: false });
    assert.equal(result.created, true);
    assert.ok(existsSync(path));
    const state = readEnvFile(path);
    assert.equal(state.hasSecret, true);
    assert.equal(state.enabled, false);
  });
});

test("seedEnvFile is idempotent — keeps the existing secret on re-run", () => {
  withTempEnvPath(({ path }) => {
    const first = seedEnvFile(path);
    const initialText = readFileSync(path, "utf8");
    const firstSecret = initialText.match(new RegExp(`${SECRET_KEY}=([^\\n]+)`))[1];

    const second = seedEnvFile(path);
    assert.equal(second.created, false);
    const secondText = readFileSync(path, "utf8");
    const secondSecret = secondText.match(new RegExp(`${SECRET_KEY}=([^\\n]+)`))[1];

    assert.equal(firstSecret, secondSecret, "idempotent run should keep the original secret");
  });
});

test("getEnvPath honours the ROCINANTE_ENV_PATH override", () => {
  withTempEnvPath(({ path }) => {
    assert.equal(getEnvPath(), path);
  });
});

test("writeEnv with enabled=false round-trips through readEnvFile", () => {
  withTempEnvPath(({ path }) => {
    writeEnv({ secret: "abc", enabled: false }, path);
    const state = readEnvFile(path);
    assert.equal(state.hasSecret, true);
    assert.equal(state.enabled, false);
  });
});

test("readEnvFile ignores comments and blank lines", () => {
  withTempEnvPath(({ path }) => {
    const text = `# top comment\n\n${SECRET_KEY}=realvalue\n# another comment\n${ENABLED_KEY}=true\n`;
    writeFileSync(path, text);
    const state = readEnvFile(path);
    assert.equal(state.hasSecret, true);
    assert.equal(state.enabled, true);
  });
});
