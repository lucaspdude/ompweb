import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const tmp = mkdtempSync(join(tmpdir(), "project-meta-test-"));

// Import the lib after creating the workspace; ts-stripping handles the .ts.
const { parseProjectMeta, readProjectMeta, writeProjectMeta, projectMetaPath, EMPTY_PROJECT_META } =
  await import("./project-meta.ts");

test.after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test("parseProjectMeta returns empty meta on garbage input", () => {
  assert.deepEqual(parseProjectMeta("not json"), { ...EMPTY_PROJECT_META });
  assert.deepEqual(parseProjectMeta(""), { ...EMPTY_PROJECT_META });
  assert.deepEqual(parseProjectMeta("null"), { ...EMPTY_PROJECT_META });
  assert.deepEqual(parseProjectMeta("[]"), { ...EMPTY_PROJECT_META });
});

test("parseProjectMeta fills defaults for missing fields", () => {
  const parsed = parseProjectMeta(JSON.stringify({ name: "x" }));
  assert.equal(parsed.name, "x");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.archived, false);
  assert.deepEqual(parsed.metadata, {});
});

test("parseProjectMeta coerces non-string scalar fields to defaults", () => {
  const parsed = parseProjectMeta(
    JSON.stringify({ name: 42, description: null, archived: "yes", metadata: "nope" }),
  );
  assert.equal(parsed.name, "");
  assert.equal(parsed.description, "");
  assert.equal(parsed.archived, false);
  assert.deepEqual(parsed.metadata, {});
});

test("readProjectMeta yields empty meta when file missing", () => {
  const meta = readProjectMeta(join(tmp, "no-such"));
  assert.deepEqual(meta, { ...EMPTY_PROJECT_META });
});

test("writeProjectMeta creates .omp/project.json atomically with full shape", () => {
  const projectRoot = join(tmp, "p1");
  const meta = writeProjectMeta(projectRoot, { name: "P1", description: "d" });
  assert.equal(meta.version, 1);
  assert.equal(meta.name, "P1");
  assert.equal(meta.description, "d");
  assert.equal(meta.archived, false);
  assert.ok(meta.createdAt, "createdAt stamped");
  assert.ok(meta.updatedAt, "updatedAt stamped");
  const onDisk = JSON.parse(readFileSync(projectMetaPath(projectRoot), "utf8"));
  assert.equal(onDisk.name, "P1");
});

test("writeProjectMeta preserves existing createdAt on subsequent writes", async () => {
  const projectRoot = join(tmp, "p2");
  const first = writeProjectMeta(projectRoot, { name: "P2" });
  // Wait at least 1 ms so the next ISO string is strictly newer
  await new Promise((r) => setTimeout(r, 5));
  const second = writeProjectMeta(projectRoot, { description: "updated" });
  assert.equal(second.createdAt, first.createdAt, "createdAt preserved");
  assert.notEqual(second.updatedAt, first.updatedAt, "updatedAt refreshed");
  assert.equal(second.name, "P2");
  assert.equal(second.description, "updated");
});

test("writeProjectMeta merges metadata bag without losing existing keys", () => {
  const projectRoot = join(tmp, "p3");
  writeProjectMeta(projectRoot, { metadata: { a: 1, b: 2 } });
  const merged = writeProjectMeta(projectRoot, { metadata: { b: 3, c: 4 } });
  assert.deepEqual(merged.metadata, { a: 1, b: 3, c: 4 });
});

test("writeProjectMeta rejects non-object metadata", () => {
  const projectRoot = join(tmp, "p4");
  writeProjectMeta(projectRoot, { metadata: { keep: true } });
  const after = writeProjectMeta(projectRoot, { metadata: "ignored" });
  assert.deepEqual(after.metadata, { keep: true });
});

test("readProjectMeta round-trips a written meta", () => {
  const projectRoot = join(tmp, "p5");
  writeProjectMeta(projectRoot, { name: "Round", description: "Trip", archived: true });
  const back = readProjectMeta(projectRoot);
  assert.equal(back.name, "Round");
  assert.equal(back.description, "Trip");
  assert.equal(back.archived, true);
});
