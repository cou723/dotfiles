import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(process.env.PI_CORE_ENTRY);
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@earendil-works/pi-tui": require.resolve("@earendil-works/pi-tui") },
});
const { default: extension, showAgentPicker } = await jiti.import("../../active-agent-ui.ts");
const { visibleWidth, getKeybindings, CURSOR_MARKER } = require("@earendil-works/pi-tui");

const title = "Select active agent (current: worker; ↑/↓, Enter, Esc: cancel)";
const labels = [
  "○ Off [disabled] — disable active agent mode",
  "● worker [primary] — 作業担当",
  "○ pi-configurator [primary] — Pi の設定担当",
  "○ reviewer [all] — reviews worker changes",
];
const theme = { fg: (_color, text) => text };

function pickerHarness() {
  let component;
  let settled = false;
  let result;
  let renders = 0;
  const ctx = { ui: { custom: (factory) => new Promise((resolve) => {
    component = factory({ requestRender: () => renders++ }, theme, getKeybindings(), (value) => {
      settled = true;
      result = value;
      resolve(value);
    });
  }) } };
  const promise = showAgentPicker(ctx, labels);
  return { component, promise, ctx, settled: () => settled, result: () => result, renders: () => renders };
}

test("fuzzy name filtering, navigation, exact router result, and focus", async () => {
  const h = pickerHarness();
  h.component.focused = true;
  assert.equal(h.component.focused, true);
  assert.ok(h.component.render(100).some((line) => line.includes(CURSOR_MARKER)));
  h.component.handleInput("wkr");
  assert.match(h.component.render(100).join("\n"), /worker \[primary\]/);
  assert.doesNotMatch(h.component.render(100).join("\n"), /reviewer \[all\]/);
  h.component.handleInput("\r");
  assert.equal(await h.promise, labels[1]);
  assert.ok(h.renders() > 0);

  const navigate = pickerHarness();
  navigate.component.handleInput("\x1b[B");
  navigate.component.handleInput("\x1b[B");
  navigate.component.handleInput("\x1b[A");
  navigate.component.handleInput("\r");
  assert.equal(await navigate.promise, labels[1]);
});

test("no-match Enter is inert, editing restores candidates, Off and Esc", async () => {
  const h = pickerHarness();
  h.component.handleInput("zzzz");
  h.component.handleInput("\r");
  assert.equal(h.settled(), false);
  assert.match(h.component.render(100).join("\n"), /No matching agents/);
  for (let i = 0; i < 4; i++) h.component.handleInput("\x7f");
  h.component.handleInput("\r");
  assert.equal(await h.promise, labels[0]);
  const cancel = pickerHarness();
  cancel.component.handleInput("\x1b");
  assert.equal(await cancel.promise, undefined);
});

test("bounded rendering, scrolling, paste, resize, and invalidation", async () => {
  const h = pickerHarness();
  h.component.focused = true;
  h.component.handleInput("\x1b[200~pi-configurator\x1b[201~");
  for (const width of [1, 5, 12, 40, 100]) {
    h.component.invalidate();
    assert.ok(h.component.render(width).every((line) => visibleWidth(line) <= width));
  }
  h.component.handleInput("\r");
  assert.equal(await h.promise, labels[2]);
});

test("router dialog adapter returns original labels and preserves cancellation", async () => {
  const events = new Map();
  let component;
  const original = async () => "original";
  const ctx = {
    mode: "tui",
    sessionManager: { getEntries: () => [] },
    ui: {
      select: original,
      setWidget() {},
      custom: (factory) => new Promise((resolve) => {
        component = factory({ requestRender() {} }, theme, getKeybindings(), resolve);
      }),
    },
  };
  extension({ on: (name, callback) => events.set(name, callback), registerShortcut() {} });
  events.get("session_start")({}, ctx);
  try {
    const selected = ctx.ui.select(title, labels);
    component.handleInput("picfg");
    component.handleInput("\r");
    assert.equal(await selected, labels[2]);
    const cancelled = ctx.ui.select(title, labels);
    component.handleInput("\x1b");
    assert.equal(await cancelled, undefined);
  } finally {
    events.get("session_shutdown")({}, ctx);
  }
  assert.equal(ctx.ui.select, original);
  events.get("session_start")({}, { ...ctx, mode: "rpc" });
  assert.equal(ctx.ui.select, original);
});

test("persistent display, shortcut dispatch, and lifecycle", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const timers = new Set();
  globalThis.setInterval = (callback) => {
    const timer = { callback, unref() {} };
    timers.add(timer);
    return timer;
  };
  globalThis.clearInterval = (timer) => timers.delete(timer);
  try {
    const events = new Map();
    const shortcuts = new Map();
    const messages = [];
    const notifications = [];
    const widgets = [];
    let commands = [{ name: "agent" }];
    const entries = [];
    const ctx = {
      mode: "tui",
      sessionManager: { getEntries: () => entries },
      ui: {
        select: async () => "original",
        custom: pickerHarness().ctx.ui.custom,
        setWidget: (...args) => widgets.push(args),
        notify: (...args) => notifications.push(args),
      },
    };
    extension({
      on: (name, callback) => events.set(name, callback),
      registerShortcut: (key, options) => shortcuts.set(key, options),
      getCommands: () => commands,
      sendUserMessage: (...args) => messages.push(args),
    });
    const currentLine = (width = 120) => {
      const [, factory, options] = widgets.at(-1);
      assert.equal(options.placement, "belowEditor");
      return factory({}, { fg: (_color, text) => text }).render(width)[0];
    };
    const tick = () => { for (const timer of timers) timer.callback(); };
    const selectAgent = (name) => entries.push({ type: "custom", customType: "active_agent", data: { name } });

    const originalSelect = ctx.ui.select;
    events.get("session_start")({}, ctx);
    assert.notEqual(ctx.ui.select, originalSelect);
    assert.equal(await ctx.ui.select("Other dialog", labels), "original");
    assert.equal(await ctx.ui.select(title, ["unexpected format"]), "original");
    assert.equal(await ctx.ui.select(title, labels, { timeout: 100 }), "original");
    assert.match(currentLine(), /Active agent: unknown/);
    selectAgent("pi-configurator");
    tick();
    assert.match(currentLine(), /Active agent: pi-configurator/);
    const widgetCount = widgets.length;
    tick();
    assert.equal(widgets.length, widgetCount);
    selectAgent("worker");
    tick();
    assert.match(currentLine(), /Active agent: worker/);
    selectAgent(null);
    tick();
    assert.match(currentLine(), /Active agent: none/);
    assert.ok(visibleWidth(currentLine(12)) <= 12);

    shortcuts.get("alt+a").handler(ctx);
    assert.deepEqual(messages, [["/agent", { expandPromptTemplates: true }]]);
    commands = [];
    shortcuts.get("alt+a").handler(ctx);
    assert.equal(messages.length, 1);
    assert.equal(notifications.length, 1);

    events.get("session_start")({}, ctx);
    assert.equal(timers.size, 1);
    events.get("session_shutdown")({}, ctx);
    assert.equal(timers.size, 0);
    assert.equal(ctx.ui.select, originalSelect);
    assert.equal(widgets.at(-1)[1], undefined);
    const afterShutdown = widgets.length;
    events.get("session_start")({}, { ...ctx, mode: "print" });
    shortcuts.get("alt+a").handler({ ...ctx, mode: "rpc" });
    assert.equal(timers.size, 0);
    assert.equal(widgets.length, afterShutdown);
    assert.equal(messages.length, 1);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
