import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ReminderState, snapshot } from "../lib/commit-reminder.mjs";

const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });

test("baseline, duplicate suppression, clean reset and one continuation per run", () => {
  const state = new ReminderState();
  state.initialize("preexisting"); state.start();
  assert.equal(state.observe("preexisting"), false);
  assert.equal(state.observe("new"), true);
  assert.equal(state.observe("new"), false);
  assert.equal(state.settle(false), false);
  assert.equal(state.settle(true), true);
  assert.equal(state.observe("newer"), true);
  assert.equal(state.settle(true), false);
  state.start();
  assert.equal(state.observe(""), false);
  assert.equal(state.settle(true), false);
  assert.equal(state.observe("new"), true);
});

test("Git snapshot covers staged, unstaged and untracked contents without modifying Git", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-reminder-"));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Test"); git(root, "config", "user.email", "test@example.invalid");
    await writeFile(join(root, "tracked"), "base");
    git(root, "add", "tracked"); git(root, "commit", "-qm", "base");
    assert.equal(await snapshot(root, root), "");
    assert.equal(await snapshot(root, tmpdir()), null);
    await writeFile(join(root, "tracked"), "edited");
    const unstaged = await snapshot(root, root);
    assert.equal(unstaged.length, 64);
    git(root, "add", "tracked");
    assert.notEqual(await snapshot(root, root), unstaged);
    await writeFile(join(root, "new file"), "one");
    const before = await snapshot(root, root);
    const status = git(root, "status", "--porcelain");
    await writeFile(join(root, "new file"), "two");
    assert.notEqual(await snapshot(root, root), before);
    assert.equal(git(root, "status", "--porcelain"), status);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("real Pi loader registers hooks; abort and same-baseline settlement never continue", async () => {
  const piDir = process.env.PI_PACKAGE_DIR;
  assert.ok(piDir, "set PI_PACKAGE_DIR to the installed Pi lib/pi directory");
  const { loadExtensions } = await import(pathToFileURL(join(piDir,
    "node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js")));
  const root = await mkdtemp(join(tmpdir(), "pi-reminder-hooks-"));
  try {
  await cp(resolve(".pi"), join(root, ".pi"), { recursive: true });
  git(root, "init", "-q");
  const loaded = await loadExtensions([join(root, ".pi/extensions/commit-reminder.ts")], root);
  assert.deepEqual(loaded.errors, []);
  const handlers = loaded.extensions[0].handlers;
  for (const name of ["session_start", "agent_start", "turn_end", "agent_before_settle"])
    assert.ok(handlers.has(name), name);
  const ctx = { cwd: root, hasUI: false, ui: {} };
  const invoke = async (name, event = {}) => {
    let result;
    for (const handler of handlers.get(name)) result = await handler(event, ctx);
    return result;
  };
  await invoke("session_start"); await invoke("agent_start");
  const event = { outcome: "completed", entries: [], context: { canContinue: false } };
  assert.equal(await invoke("turn_end", event), undefined);
  assert.equal(await invoke("agent_before_settle", event), undefined);
  assert.equal(await invoke("agent_before_settle", { ...event, outcome: "aborted" }), undefined);
  await writeFile(join(root, "work"), "change");
  const notified = await invoke("turn_end", event);
  assert.equal(notified.entries[0].type, "custom_message");
  assert.equal(notified.continue, undefined);
  assert.equal(await invoke("turn_end", event), undefined);
  assert.equal(await invoke("agent_before_settle", { ...event, outcome: "aborted" }), undefined);
  const continued = await invoke("agent_before_settle", event);
  assert.equal(continued.continue, true);
  assert.equal(continued.entries[0].type, "custom_message");
  await writeFile(join(root, "work"), "another change");
  const once = await invoke("agent_before_settle", event);
  assert.equal(once.continue, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});
