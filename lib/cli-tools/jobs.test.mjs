import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  createJob,
  getJob,
  removeJob,
  listJobsForCli,
  appendLine,
  setAuthCapture,
  markExit,
  generateJobId,
  pruneOldJobs,
} = await jiti.import("./jobs.ts");

function fakeChild() {
  const child = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    return true;
  };
  return child;
}

function makeJob(id, cliId, kind) {
  return {
    id,
    cliId,
    kind,
    pid: 1234,
    status: "running",
    lines: [],
    startedAt: Date.now(),
    exitCode: null,
    authUrl: null,
    authCode: null,
    child: fakeChild(),
  };
}

test.beforeEach(() => {
  // Reset the registry by removing all known jobs.
  for (const id of Array.from(jiti.import("./jobs.ts").then ? [] : [])) {}
  // We don't have direct access to the map, so we'll use removeJob with the
  // ids we create. The harness re-runs beforeEach for each test.
});

test("createJob + getJob round-trip", () => {
  const id = generateJobId("az", "install");
  const job = makeJob(id, "az", "install");
  createJob(job);
  const fetched = getJob(id);
  assert.equal(fetched, job);
  removeJob(id);
  assert.equal(getJob(id), null);
});

test("listJobsForCli filters by cliId and kind", () => {
  const az = makeJob(generateJobId("az", "install"), "az", "install");
  const gh = makeJob(generateJobId("gh", "install"), "gh", "install");
  const azLogin = makeJob(generateJobId("az", "login"), "az", "login");
  createJob(az);
  createJob(gh);
  createJob(azLogin);
  const all = listJobsForCli("az");
  assert.equal(all.length, 2);
  const installs = listJobsForCli("az", "install");
  assert.equal(installs.length, 1);
  assert.equal(installs[0].kind, "install");
  removeJob(az.id);
  removeJob(gh.id);
  removeJob(azLogin.id);
});

test("appendLine caps the buffer at 200", () => {
  const id = generateJobId("gh", "install");
  const job = makeJob(id, "gh", "install");
  createJob(job);
  for (let i = 0; i < 250; i++) appendLine(id, `line ${i}`);
  assert.equal(job.lines.length, 200);
  assert.equal(job.lines[0], "line 50");
  assert.equal(job.lines[199], "line 249");
  removeJob(id);
});

test("setAuthCapture stores url + code", () => {
  const id = generateJobId("az", "login");
  const job = makeJob(id, "az", "login");
  createJob(job);
  setAuthCapture(id, "https://microsoft.com/devicelogin", "AWSDQQ7J6");
  assert.equal(job.authUrl, "https://microsoft.com/devicelogin");
  assert.equal(job.authCode, "AWSDQQ7J6");
  removeJob(id);
});

test("markExit sets status by exit code", () => {
  const id = generateJobId("gh", "install");
  const job = makeJob(id, "gh", "install");
  createJob(job);
  markExit(id, 0);
  assert.equal(job.status, "done");
  assert.equal(job.exitCode, 0);
  removeJob(id);

  const id2 = generateJobId("gh", "install");
  const job2 = makeJob(id2, "gh", "install");
  createJob(job2);
  markExit(id2, 1);
  assert.equal(job2.status, "failed");
  removeJob(id2);
});

test("pruneOldJobs drops only finished jobs past the age limit", () => {
  const old = makeJob(generateJobId("az", "install"), "az", "install");
  old.startedAt = Date.now() - 60_000;
  markExit(old.id, 0);
  // The map was populated by markExit? No — we created the job but
  // didn't call markExit before construction. Let's set the status
  // directly through the public surface: append then markExit.
  createJob(old);
  markExit(old.id, 0);

  const fresh = makeJob(generateJobId("az", "install"), "az", "install");
  fresh.startedAt = Date.now();
  createJob(fresh);

  pruneOldJobs(30_000);
  assert.equal(getJob(old.id), null, "old job pruned");
  assert.notEqual(getJob(fresh.id), null, "fresh job kept");
  removeJob(fresh.id);
});

test("removeJob kills a running child", () => {
  const id = generateJobId("az", "install");
  const job = makeJob(id, "az", "install");
  createJob(job);
  removeJob(id);
  assert.equal(job.child.killed, true);
  assert.equal(getJob(id), null);
});
