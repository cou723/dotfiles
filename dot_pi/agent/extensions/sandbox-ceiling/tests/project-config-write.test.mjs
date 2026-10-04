import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BubblewrapBackend } from "../backend.ts";
import { protectedWritePaths, resolvePolicy } from "../definitions.ts";
import { compose, inside, permitted } from "../policy.ts";

const fixture = mkdtempSync(path.join(tmpdir(), "pi-project-config-write-"));
try {
  const home = path.join(fixture, "home"), cwd = path.join(fixture, "repo");
  const agentDir = path.join(home, ".pi/agent"), extensionDir = path.join(agentDir, "extensions/sandbox-ceiling");
  const agents = path.join(cwd, ".pi/agents"), extensions = path.join(cwd, ".pi/extensions");
  for (const dir of [extensionDir, agents, extensions]) mkdirSync(dir, { recursive: true });
  const declaration = { sandbox: { read: [cwd], write: [cwd] }, capabilities: ["pi_project_config_write"] };
  const globals = new Map([["settings-editor", declaration]]);
  const admin = resolvePolicy("settings-editor", cwd, globals, new Map());
  const createBackend = (projectConfigWrite, child = false) => new BubblewrapBackend({
    executable: "/unused", runtimeRead: [], timeoutMs: 1000,
    protectedWrite: protectedWritePaths(agentDir, extensionDir, cwd, projectConfigWrite, child),
  });
  const writer = createBackend(admin.projectConfigWrite);
  for (const target of [path.join(agents, "advisor.md"), path.join(extensions, "local.ts"), path.join(cwd, ".pi/settings.json")]) {
    assert.equal(permitted(target, cwd, admin.scope.write), target);
    assert.equal(writer.config.protectedWrite.some(root => inside(root, target)), false);
  }
  const args = writer.args(admin.scope, cwd, ["/bin/true"]);
  assert.equal(args.includes(agents), false, "Primary project directories must not receive read-only overlays");
  for (const backend of [createBackend(false), createBackend(true, true)]) {
    assert.equal(backend.config.protectedWrite.includes(agents), true);
    assert.equal(backend.config.protectedWrite.includes(extensions), true);
    assert.equal(backend.args(admin.scope, cwd, ["/bin/true"]).includes(agents), true);
    assert.throws(() => backend.args({ read: [agents], write: [agents] }, cwd, ["/bin/true"]), /immutable/);
  }
  const overridden = resolvePolicy("settings-editor", cwd, globals, new Map([["settings-editor", declaration]]));
  assert.equal(overridden.projectConfigWrite, false, "A project override cannot acquire the global capability");
  const narrowed = compose(admin.scope, { read: [cwd], write: [] });
  assert.throws(() => permitted(path.join(agents, "advisor.md"), cwd, narrowed.write), /outside/);
  assert.throws(() => permitted(path.join(home, "outside.md"), cwd, admin.scope.write), /outside/);
  assert.equal(writer.config.protectedWrite.includes(path.join(home, ".pi")), true);
  assert.throws(() => writer.args({ read: [home], write: [agentDir] }, cwd, ["/bin/true"]), /immutable/);
  const fromHome = new BubblewrapBackend({ ...writer.config, protectedWrite: protectedWritePaths(agentDir, extensionDir, home, true, false) });
  assert.equal(fromHome.args({ read: [home], write: [home] }, home, ["/bin/true"]).includes(path.join(home, ".pi")), true, "Starting in home must not open global Pi configuration");
  console.log("PASS: primary project write grants, worker/child denial, OS overlay arguments, project override denial, invocation narrowing and global protection");
  if (process.env.POC_BWRAP) {
    const runtimeRead = ["/usr", "/bin", "/lib", "/lib64", "/nix/store"].filter(existsSync);
    const run = (backend, scope, command) => new BubblewrapBackend({
      ...backend.config, runtimeRead, executable: process.env.POC_BWRAP, timeoutMs: 3000,
    }).run(scope, cwd, ["/bin/sh", "-c", command], "");
    const target = path.join(agents, "fixture.md");
    await run(writer, admin.scope, `printf primary > '${target}'`);
    assert.equal(readFileSync(target, "utf8"), "primary");
    for (const backend of [createBackend(false), createBackend(true, true)]) {
      await assert.rejects(run(backend, admin.scope, `printf forbidden > '${target}'`), /read-only|Read-only/);
      assert.equal(readFileSync(target, "utf8"), "primary");
    }
    await assert.rejects(run(writer, { read: [home, cwd], write: [home, cwd] }, `printf forbidden > '${agentDir}/global.json'`), /read-only|Read-only/);
    assert.equal(existsSync(path.join(agentDir, "global.json")), false);
    console.log("PASS: actual bubblewrap primary write, worker/child read-only overlays and global direct-write denial");
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
