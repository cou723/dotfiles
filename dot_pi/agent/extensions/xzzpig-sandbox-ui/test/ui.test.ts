import { test } from "node:test";
import assert from "node:assert/strict";
import { registerSandboxPicker } from "../ui.ts";

function fixture() {
  const shortcuts = new Map(), commands = new Map();
  let profile = "workspace", idle = true, choice: string | undefined, warning: string | undefined;
  let calls = 0;
  const notifications: { text: string; type: string }[] = [];
  const service: any = {
    listProfiles: () => ["review", "workspace"], getProfile: () => profile,
    setProfile: async (name: string) => {
      calls++;
      if (!service.listProfiles().includes(name)) return { ok: false, message: "unknown" };
      profile = name; return { ok: true, message: warning };
    },
  };
  const ctx: any = {
    hasUI: true, isIdle: () => idle, sessionManager: { getSessionId: () => "session" },
    ui: { notify: (text: string, type: string) => notifications.push({ text, type }),
      select: async (_title: string, choices: string[]) => choices.find(c => c.startsWith(`○ ${choice}`)) },
  };
  const pi: any = { registerShortcut: (key, value) => shortcuts.set(key, value), registerCommand: (key, value) => commands.set(key, value) };
  registerSandboxPicker(pi, id => id === "session" ? service : undefined);
  return { ctx, shortcuts, commands, notifications, profile: () => profile, calls: () => calls,
    choose: (name: string) => { choice = name; }, busy: () => { idle = false; }, disabled: () => { warning = "sandbox is disabled"; } };
}
test("Alt+A applies a selected profile through the service", async () => {
  const f = fixture(); f.choose("review"); await f.shortcuts.get("alt+a").handler(f.ctx);
  assert.equal(f.profile(), "review"); assert.equal(f.calls(), 1);
});
test("cancel does not modify selection", async () => {
  const f = fixture(); await f.shortcuts.get("alt+a").handler(f.ctx); assert.equal(f.calls(), 0);
});
test("busy sessions reject picker and direct command", async () => {
  const f = fixture(); f.busy(); f.choose("review");
  await f.shortcuts.get("alt+a").handler(f.ctx); await f.commands.get("sandbox-profile").handler("review", f.ctx);
  assert.equal(f.calls(), 0);
});
test("disabled sandbox warning is shown rather than reporting enforcement", async () => {
  const f = fixture(); f.disabled(); await f.commands.get("sandbox-profile").handler("review", f.ctx);
  assert.ok(f.notifications.some(n => n.type === "warning" && n.text === "sandbox is disabled"));
});
