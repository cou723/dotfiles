import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { createPiPermExtension } from "pi-perm/core/extension.ts";
import { registerPermissionUI } from "../ui.ts";

const require = createRequire(import.meta.url);
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "pi-perm-ui-test-"));
  const core = createPiPermExtension({
    extensionRoot: dirname(require.resolve("pi-perm/package.json")),
    cwd: dir,
    userPath: join(dir, "absent.toml"),
    runtimeBaseDir: dir,
  });
  const shortcuts = new Map(), commands = new Map(), events = new Map();
  const pi: any = {
    registerShortcut: (name, options) => shortcuts.set(name, options),
    registerCommand: (name, options) => commands.set(name, options),
    on: (name, handler) => events.set(name, handler),
  };
  const notifications: string[] = [], statuses: string[] = [];
  let idle = true, selection: string | undefined;
  let selectCount = 0, confirm = false;
  const ctx: any = {
    hasUI: true, isIdle: () => idle,
    ui: {
      notify: (text: string) => notifications.push(text),
      setStatus: (_key: string, text: string) => statuses.push(text),
      select: async (_title: string, choices: string[]) => {
        selectCount++;
        return choices.find(choice => choice.startsWith(`○ ${selection}`));
      },
      confirm: async () => confirm,
    },
  };
  registerPermissionUI(pi, core);
  return { core, ctx, shortcuts, commands, events, notifications, statuses,
    setIdle: (value: boolean) => { idle = value; },
    choose: (value: string | undefined) => { selection = value; },
    allowDanger: () => { confirm = true; },
    selectCount: () => selectCount,
    close: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("Alt+A switches via upstream handler and clears temporary grants", async () => {
  const f = fixture();
  try {
    f.core.state.sessionAllows.set("grant", {} as any);
    f.core.state.sessionFilesystemAllows.set("grant", {} as any);
    f.choose(":read-only");
    await f.shortcuts.get("alt+a").handler(f.ctx);
    assert.equal(f.core.policySummary().activeProfile, ":read-only");
    assert.equal(f.core.state.sessionAllows.size, 0);
    assert.equal(f.core.state.sessionFilesystemAllows.size, 0);
    assert.match(f.statuses.at(-1)!, /:read-only/);
  } finally { f.close(); }
});
test("cancel leaves profile and temporary grants unchanged", async () => {
  const f = fixture();
  try {
    f.core.state.sessionAllows.set("grant", {} as any);
    await f.shortcuts.get("alt+a").handler(f.ctx);
    assert.equal(f.core.policySummary().activeProfile, "workspace");
    assert.equal(f.core.state.sessionAllows.size, 1);
  } finally { f.close(); }
});
test("busy session rejects both picker and use command", async () => {
  const f = fixture();
  try {
    f.setIdle(false); f.choose(":read-only");
    await f.shortcuts.get("alt+a").handler(f.ctx);
    await f.commands.get("pi-perm").handler("use :read-only", f.ctx);
    assert.equal(f.selectCount(), 0);
    assert.equal(f.core.policySummary().activeProfile, "workspace");
  } finally { f.close(); }
});
test("danger-full-access requires explicit confirmation in picker", async () => {
  const f = fixture();
  try {
    f.choose(":danger-full-access");
    await f.shortcuts.get("alt+a").handler(f.ctx);
    assert.equal(f.core.policySummary().activeProfile, "workspace");
    f.allowDanger();
    await f.shortcuts.get("alt+a").handler(f.ctx);
    assert.equal(f.core.policySummary().activeProfile, ":danger-full-access");
  } finally { f.close(); }
});
test("slash use and completion retain original profile names", async () => {
  const f = fixture();
  try {
    const cmd = f.commands.get("pi-perm");
    assert.ok(cmd.getArgumentCompletions("use :read").some((c: any) => c.value === "use :read-only"));
    await cmd.handler("use :read-only", f.ctx);
    assert.equal(f.core.policySummary().activeProfile, ":read-only");
    await cmd.handler("use missing", f.ctx);
    assert.equal(f.core.policySummary().activeProfile, ":read-only");
  } finally { f.close(); }
});
