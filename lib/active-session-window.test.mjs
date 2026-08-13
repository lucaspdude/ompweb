import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { ACTIVE_SESSION_WINDOW_MS, isSessionActive, partitionByActivity } =
  await jiti.import("./active-session-window.ts");

const NOW = Date.parse("2026-08-12T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

test("ACTIVE_SESSION_WINDOW_MS defaults to 12 hours", () => {
  assert.equal(ACTIVE_SESSION_WINDOW_MS, 12 * HOUR);
});

test("isSessionActive: within window = true", () => {
  assert.equal(isSessionActive({ modified: new Date(NOW - 6 * HOUR).toISOString() }, NOW), true);
});

test("isSessionActive: exactly at the window boundary = true (inclusive)", () => {
  assert.equal(
    isSessionActive({ modified: new Date(NOW - 12 * HOUR).toISOString() }, NOW),
    true,
  );
});

test("isSessionActive: just past the window = false", () => {
  assert.equal(
    isSessionActive({ modified: new Date(NOW - 12 * HOUR - 1).toISOString() }, NOW),
    false,
  );
});

test("isSessionActive: unparseable modified = treated as active", () => {
  assert.equal(isSessionActive({ modified: "not a date" }, NOW), true);
});

test("partitionByActivity splits and preserves order", () => {
  const sessions = [
    { id: "a1", modified: new Date(NOW - 1 * HOUR).toISOString() },
    { id: "o1", modified: new Date(NOW - 24 * HOUR).toISOString() },
    { id: "a2", modified: new Date(NOW - 0 * HOUR).toISOString() },
    { id: "o2", modified: new Date(NOW - 13 * HOUR).toISOString() },
  ];
  const { active, old } = partitionByActivity(sessions, NOW);
  assert.deepEqual(active.map((s) => s.id), ["a1", "a2"]);
  assert.deepEqual(old.map((s) => s.id), ["o1", "o2"]);
});
