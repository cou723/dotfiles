import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BubblewrapBackend } from "../backend.ts";
import { canonical, compose, intersect, parseScope, permitted } from "../policy.ts";

const extensionDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sdkEntry = process.env.POC_SDK_ENTRY;
assert.ok(sdkEntry, "Set POC_SDK_ENTRY to Pi dist/index.js");
const fixture = mkdtempSync(path.join(tmpdir(), "pi-ceiling-test-"));
const repo = path.join(fixture, "repo");
const outside = path.join(fixture, "outside");
mkdirSync(repo);
mkdirSync(outside);
writeFileSync(path.join(repo, "allowed.txt"), "allowed\n");
writeFileSync(path.join(outside, "secret.txt"), "outside sentinel\n");
symlinkSync(path.join(outside, "secret.txt"), path.join(repo, "escape"));
const runtimeRead = [
  "/usr",
  "/bin",
  "/lib",
  "/lib64",
  "/nix/store",
  path.join(homedir(), ".nix-profile"),
  path.join(homedir(), ".local/share/pnpm/store"),
  path.join(homedir(), ".pi/agent/bin"),
  extensionDir,
  path.dirname(path.dirname(sdkEntry)),
  path.resolve(extensionDir, "../node_modules"),
].filter(existsSync);
const backend = new BubblewrapBackend({
  executable: path.join(homedir(), ".nix-profile/bin/bwrap"),
  runtimeRead,
  protectedWrite: [],
  timeoutMs: 15000,
});
const machine = { read: [repo], write: [repo] };
const planner = { read: [repo], write: [] };
const worker = machine;
/** @param {string} tool @param {Record<string, unknown>} input @param {import("../policy.ts").Scope} [scope] */
const run = async (tool, input, scope = worker) => {
  const output = await backend.run(
    scope,
    repo,
    [process.execPath, path.join(extensionDir, "runner.mjs")],
    JSON.stringify({ sdkEntry, cwd: repo, tool, id: "poc", input }),
  );
  return JSON.parse(output);
};
try {
  assert.deepEqual(intersect([repo], [outside]), []);
  assert.deepEqual(compose(machine, worker, planner).write, []);
  assert.deepEqual(compose(machine, worker).write, [repo]);
  assert.throws(() => parseScope({ read: [repo], write: [outside] }, repo));
  assert.throws(() => permitted("escape", repo, [repo]), /outside/);
  assert.throws(() => permitted("../outside/new.txt", repo, [repo]), /outside/);
  assert.equal(canonical(path.join(repo, "new-dir/new.txt")), path.join(repo, "new-dir/new.txt"));
  assert.match(JSON.stringify(await run("read", { path: "allowed.txt" }, planner)), /allowed/);
  assert.match(
    (await run("read", { path: path.join(outside, "secret.txt") })).error,
    /ENOENT|not found/,
  );
  assert.match((await run("read", { path: "escape" })).error, /ENOENT|not found/);
  const selectedFile = path.join(outside, "selected.yml");
  const siblingFile = path.join(outside, "sibling.yml");
  writeFileSync(selectedFile, "synthetic configuration\n");
  writeFileSync(siblingFile, "unselected sentinel\n");
  const fileReader = { read: [repo, selectedFile], write: [repo] };
  assert.match(
    JSON.stringify(await run("read", { path: selectedFile }, fileReader)),
    /synthetic configuration/,
  );
  assert.match((await run("read", { path: siblingFile }, fileReader)).error, /ENOENT|not found/);
  assert.match(
    (await run("write", { path: selectedFile, content: "no" }, fileReader)).error,
    /EROFS|read-only/,
  );
  assert.equal(
    (await run("bash", { command: `test -r '${selectedFile}'` }, fileReader)).result.isError,
    undefined,
  );
  assert.equal(
    (await run("bash", { command: `printf no > '${selectedFile}'` }, fileReader)).result.isError,
    true,
  );
  assert.equal(readFileSync(selectedFile, "utf8"), "synthetic configuration\n");
  assert.match(
    (await run("write", { path: "no.txt", content: "no" }, planner)).error,
    /EROFS|read-only/,
  );
  assert.ok((await run("write", { path: "new.txt", content: "worker" })).result);
  assert.equal(readFileSync(path.join(repo, "new.txt"), "utf8"), "worker");
  assert.ok(
    (await run("edit", { path: "new.txt", edits: [{ oldText: "worker", newText: "edited" }] }))
      .result,
  );
  assert.equal(readFileSync(path.join(repo, "new.txt"), "utf8"), "edited");
  const deniedBash = await run("bash", { command: `printf hacked > '${outside}/secret.txt'` });
  assert.equal(deniedBash.result.isError, true);
  assert.equal(readFileSync(path.join(outside, "secret.txt"), "utf8"), "outside sentinel\n");
  assert.equal((await run("bash", { command: "printf ok > shell.txt" })).result.isError, undefined);
  assert.equal(readFileSync(path.join(repo, "shell.txt"), "utf8"), "ok");
  assert.equal(
    (await run("bash", { command: "printf no > read-only.txt" }, planner)).result.isError,
    true,
  );
  /** @type {[string, Record<string, unknown>][]} */
  const searchCases = [
    ["grep", { pattern: "allowed" }],
    ["find", { pattern: "*.txt" }],
    ["ls", {}],
  ];
  for (const [tool, input] of searchCases) {
    const output = await run(tool, input, planner);
    assert.ok(output.result, JSON.stringify(output));
  }
  const rootWrite = await run("bash", { command: "printf no > /outside-ceiling-poc.txt" });
  assert.equal(rootWrite.result.isError, true);
  const parentProc = await run("bash", {
    command: `test -e /proc/${process.pid}/root${outside}/secret.txt`,
  });
  assert.equal(parentProc.result.isError, true);
  const unavailable = new BubblewrapBackend({ ...backend.config, executable: "/missing-bwrap" });
  await assert.rejects(unavailable.run(worker, repo, ["/bin/true"], ""), /ENOENT/);
  await assert.rejects(
    backend.run(worker, repo, ["/bin/sleep", "30"], "", AbortSignal.timeout(100)),
    /aborted/,
  );
  console.log(
    "PASS: intersection, traversal, symlinks, all seven tools, parent/child authority, OS read/write boundary, root/proc escape, missing backend, cancellation",
  );
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
