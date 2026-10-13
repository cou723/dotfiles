import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ReminderState, snapshot } from "../lib/commit-reminder.mjs";

const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });

test("one notification per prompt, including new edits and a clean worktree", () => {
  const state = new ReminderState();
  state.initialize("preexisting"); state.start();
  assert.equal(state.observe(null), false);
  assert.equal(state.observe("preexisting"), false);
  assert.equal(state.observe("new"), true);
  assert.equal(state.observe("new"), false);
  assert.equal(state.observe("newer"), false);
  assert.equal(state.observe(""), false);
  assert.equal(state.observe("after-commit"), false, "committing does not replenish the allowance");
  state.start();
  assert.equal(state.observe("after-commit"), false, "suppressed changes still update the baseline");
  assert.equal(state.observe("next-prompt-edit"), true);
  state.initialize("baseline");
  assert.equal(state.observe("other"), true);
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

test("real Pi hooks suppress duplicate settlement, continuations and retries until a new prompt", async () => {
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
  for (const name of ["session_start", "before_agent_start", "turn_end", "agent_before_settle"])
    assert.ok(handlers.has(name), name);
  assert.equal(handlers.has("agent_start"), false, "loop restarts must not reset notification allowance");
  const ctx = { cwd: root, hasUI: false, ui: {} };
  const invoke = async (name, event = {}) => {
    let result;
    for (const handler of handlers.get(name)) result = await handler(event, ctx);
    return result;
  };
  await invoke("session_start"); await invoke("before_agent_start");
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
  assert.equal(await invoke("agent_before_settle", event), undefined, "no duplicate reminder or forced continuation");
  await writeFile(join(root, "work"), "another change");
  assert.equal(await invoke("turn_end", event), undefined, "new edits after notification stay silent");
  assert.equal(await invoke("agent_before_settle", event), undefined);

  await invoke("before_agent_start");
  assert.equal(await invoke("turn_end", event), undefined, "next prompt does not repeat old changes");
  await writeFile(join(root, "work"), "settlement-only change");
  const sentinel = { type: "custom_message", customType: "other", content: "keep", display: false };
  const canContinue = { ...event, entries: [sentinel], context: { canContinue: true } };
  const continued = await invoke("agent_before_settle", canContinue);
  assert.equal(continued.continue, true);
  assert.equal(continued.entries.length, 2);
  assert.equal(continued.entries[0], sentinel, "preserve other boundary entries");
  assert.equal(continued.entries[1].type, "custom_message");
  assert.match(continued.entries[1].content, /再試行は不要/);
  await writeFile(join(root, "work"), "after failed commit or continuation");
  assert.equal(await invoke("turn_end", event), undefined);
  assert.equal(await invoke("agent_before_settle", canContinue), undefined);

  await invoke("before_agent_start");
  await writeFile(join(root, "work"), "no continuation allowed");
  for (const outcome of ["aborted", "error"])
    assert.equal(await invoke("agent_before_settle", { ...event, outcome }), undefined);
  const notificationOnly = await invoke("agent_before_settle", event);
  assert.equal(notificationOnly.entries.length, 1);
  assert.equal(notificationOnly.continue, undefined, "respect canContinue=false");
  assert.equal(await invoke("agent_before_settle", event), undefined);
  loaded.runtime.invalidate();
  } finally { await rm(root, { recursive: true, force: true }); }
});
