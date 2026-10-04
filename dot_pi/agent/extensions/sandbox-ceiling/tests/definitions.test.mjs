import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolvePolicy, snapshotDefinitions } from "../definitions.ts";
import { compose, permitted } from "../policy.ts";

const fixture = mkdtempSync(path.join(tmpdir(), "pi-agent-policy-"));
try {
  const cwd = path.join(fixture, "repo"),
    external = path.join(fixture, "docs");
  mkdirSync(cwd);
  mkdirSync(external);
  const declared = {
    name: "custom-editor",
    sandbox: { read: [cwd, external], write: [cwd] },
    capabilities: ["pi_config_apply"],
  };
  writeFileSync(path.join(fixture, "custom-editor.md"), JSON.stringify(declared));
  const global = snapshotDefinitions(fixture, JSON.parse);
  const resolve = (name = "custom-editor", project = new Map()) =>
    resolvePolicy(name, cwd, global, project);
  assert.equal(permitted(external, cwd, resolve().scope.read), external);
  assert.equal(
    resolve().configApply,
    true,
    "Capability does not depend on an agent name or startup flag",
  );
  assert.deepEqual(
    resolve(
      "custom-editor",
      new Map([
        [
          "custom-editor",
          { sandbox: { read: [fixture], write: [fixture] }, capabilities: ["pi_config_apply"] },
        ],
      ]),
    ).scope,
    resolve().scope,
  );
  assert.equal(resolve("custom-editor", new Map([["custom-editor", declared]])).configApply, false);
  assert.equal(resolve().projectConfigWrite, false);
  const projectEditor = { ...declared, capabilities: ["pi_project_config_write"] };
  const editors = new Map([["custom-editor", projectEditor]]);
  assert.equal(resolvePolicy("custom-editor", cwd, editors, new Map()).projectConfigWrite, true);
  assert.equal(
    resolvePolicy("custom-editor", cwd, editors, new Map([["custom-editor", projectEditor]]))
      .projectConfigWrite,
    false,
  );
  assert.equal(
    resolvePolicy("project-only", cwd, new Map(), new Map([["project-only", projectEditor]]))
      .projectConfigWrite,
    false,
  );
  assert.deepEqual(
    resolve(
      "project-only",
      new Map([["project-only", { sandbox: { read: [fixture], write: [fixture] } }]]),
    ).scope,
    { read: [cwd], write: [cwd] },
  );
  assert.throws(() => resolve("missing"), /Unknown/);
  assert.throws(() => resolve("../escape"), /Unsafe/);
  writeFileSync(
    path.join(fixture, "custom-editor.md"),
    JSON.stringify({ ...declared, sandbox: { read: [fixture], write: [fixture] } }),
  );
  assert.deepEqual(
    resolve().scope.read,
    [external, cwd].sort(),
    "Disk edits do not alter the snapshot",
  );
  assert.deepEqual(compose(resolve().scope, { read: [cwd], write: [] }), {
    read: [cwd],
    write: [],
  });
  assert.throws(
    () =>
      resolvePolicy(
        "root",
        cwd,
        new Map([["root", { sandbox: { read: ["/"], write: [] } }]]),
        new Map(),
      ),
    /Whole-machine/,
  );
  assert.throws(
    () =>
      resolvePolicy(
        "unknown-cap",
        cwd,
        new Map([["unknown-cap", { sandbox: declared.sandbox, capabilities: ["admin"] }]]),
        new Map(),
      ),
    /capability/,
  );
  console.log(
    "PASS: declarative external read, name-independent capability, project scope clamping, project capability denial, snapshot, narrowing, invalid roots/identities/capabilities",
  );
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
