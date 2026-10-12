import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createPiPermExtension } from "pi-perm/core/extension.ts";
const require = createRequire(import.meta.url);

test("real srt: workspace write allowed, outside write and env read denied, read-only denies write", () => {
  const base = join(homedir(), ".cache");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "pi-perm-sandbox-test-"));
  const cwd = join(dir, "workspace");
  mkdirSync(cwd);
  writeFileSync(join(cwd, ".env"), "TEST_ONLY_NOT_A_SECRET=1\n");
  try {
    const core = createPiPermExtension({
      extensionRoot: dirname(require.resolve("pi-perm/package.json")),
      cwd, userPath: join(dir, "absent.toml"), runtimeBaseDir: join(dir, "runtime"),
    });
    const binary = join(dirname(require.resolve("@anthropic-ai/sandbox-runtime/package.json")), "dist/cli.js");
    core.state.config.tools.bash.srtBinary = binary;
    const run = (command: string) => {
      const wrapped = core.createBashSpawnHook()({ command, cwd, env: process.env });
      return spawnSync("bash", ["-c", wrapped.command], { cwd, encoding: "utf8", timeout: 20000 });
    };
    const allowed = run("printf ok > allowed.txt");
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.ok(existsSync(join(cwd, "allowed.txt")));
    const outside = run("printf blocked > ../outside.txt");
    assert.notEqual(outside.status, 0);
    assert.ok(!existsSync(join(dir, "outside.txt")));
    const pipeline = run("printf blocked | tee ../pipeline.txt");
    assert.notEqual(pipeline.status, 0);
    assert.ok(!existsSync(join(dir, "pipeline.txt")));
    run("printf '%s' \"$(printf blocked > ../substitution.txt)\"");
    assert.ok(!existsSync(join(dir, "substitution.txt")));
    const deniedRead = run("cat .env");
    assert.notEqual(deniedRead.status, 0);
    assert.ok(!deniedRead.stdout.includes("TEST_ONLY_NOT_A_SECRET"));
    core.handlePiPermCommand("use :read-only");
    const readonly = run("printf blocked > readonly.txt");
    assert.notEqual(readonly.status, 0);
    assert.ok(!existsSync(join(cwd, "readonly.txt")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
