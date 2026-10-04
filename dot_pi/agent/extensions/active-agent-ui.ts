import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, Input, Key, matchesKey, SelectList, truncateToWidth } from "@earendil-works/pi-tui";

const AGENT_PICKER_TITLE = /^Select active agent \(current: .+; ↑\/↓, Enter, Esc: cancel\)$/;
const AGENT_OPTION = /^[●○] (.+?) \[(primary|subagent|all|disabled)\] — (.*)$/;

export function showAgentPicker(ctx: ExtensionContext, labels: string[]): Promise<string | undefined> {
  const items = labels.map((value) => {
    const match = AGENT_OPTION.exec(value)!;
    return { value, name: match[1], label: value.slice(0, value.indexOf(" — ")), description: match[3] };
  });
  return ctx.ui.custom<string | undefined>((tui, theme, keybindings, done) => {
    const input = new Input({ prompt: "> ", placeholder: "Search agent name…" });
    let query = "";
    const makeList = () => {
      const list = new SelectList(fuzzyFilter(items, query, (item) => item.name), 10, {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: () => theme.fg("warning", "  No matching agents"),
      });
      list.onSelect = (item) => done(item.value);
      list.onCancel = () => done(undefined);
      return list;
    };
    let list = makeList();
    // Keep the router's original label as the result; never reproduce its switching logic here.
    const active = items.find((item) => item.value.startsWith("● "));
    return {
      get focused() { return input.focused; },
      set focused(value: boolean) { input.focused = value; },
      render(width: number) {
        return [
          theme.fg("accent", "Select active agent"),
          theme.fg("muted", `Active agent: ${active?.value.includes("[disabled]") ? "none" : active?.name ?? "none"}`),
          ...input.render(width),
          ...list.render(width),
          theme.fg("dim", "type to filter · ↑↓ move · Enter select · Esc cancel"),
        ].map((line) => truncateToWidth(line, width));
      },
      invalidate() { input.invalidate(); list.invalidate(); },
      handleInput(data: string) {
        if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
          done(undefined);
          return;
        }
        if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || matchesKey(data, Key.enter) ||
            keybindings.matches(data, "tui.select.up") || keybindings.matches(data, "tui.select.down") ||
            keybindings.matches(data, "tui.select.confirm") || keybindings.matches(data, "tui.select.cancel")) {
          list.handleInput(data);
        } else {
          input.handleInput(data);
          if (input.getValue() !== query) {
            query = input.getValue();
            list = makeList();
          }
        }
        tui.requestRender();
      },
    };
  });
}

const WIDGET_KEY = "active-agent-ui";

export default function activeAgentUI(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let displayedName: string | undefined;
  let restoreSelect: (() => void) | undefined;

  const installAgentPicker = (ctx: ExtensionContext) => {
    restoreSelect?.();
    const ui = ctx.ui;
    const original = ui.select;
    // Router 0.9.0 has no picker hook. Narrowly adapt its shared UI dialog instead of
    // overriding /agent or importing a second router runtime (which would bypass its state).
    const select: typeof ui.select = (title, labels, options) => {
      if (options === undefined && AGENT_PICKER_TITLE.test(title) &&
          labels.length > 0 && labels.every((label) => AGENT_OPTION.test(label))) {
        return showAgentPicker(ctx, labels);
      }
      return original.call(ui, title, labels, options);
    };
    ui.select = select;
    restoreSelect = () => {
      if (ui.select === select) ui.select = original;
      restoreSelect = undefined;
    };
  };

  const stopPolling = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    displayedName = undefined;
  };

  const updateWidget = (ctx: ExtensionContext) => {
    const entries = ctx.sessionManager.getEntries();
    let name = "unknown";
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type !== "custom" || entry.customType !== "active_agent") continue;
      const data = entry.data as { name?: unknown } | undefined;
      name = typeof data?.name === "string" ? data.name : "none";
      break;
    }
    if (name === displayedName) return;
    displayedName = name;
    ctx.ui.setWidget(WIDGET_KEY, (_tui, theme) => ({
      render: (width) => [truncateToWidth(
        theme.fg("muted", "Active agent: ") + theme.fg("accent", name) +
          theme.fg("dim", " · Alt+A: /agent"),
        width,
      )],
      invalidate() {},
    }), { placement: "belowEditor" });
  };

  pi.on("session_start", (_event, ctx) => {
    stopPolling();
    restoreSelect?.();
    if (ctx.mode !== "tui") return;
    installAgentPicker(ctx);
    updateWidget(ctx);
    // Router 0.9.0 emits no agent-change event; polling also covers its Tab cycling.
    timer = setInterval(() => updateWidget(ctx), 500);
    timer.unref();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stopPolling();
    restoreSelect?.();
    if (ctx.mode === "tui") ctx.ui.setWidget(WIDGET_KEY, undefined);
  });

  pi.registerShortcut("alt+a", {
    description: "Open the active-agent picker (/agent)",
    handler: (ctx) => {
      if (ctx.mode !== "tui") return;
      if (!pi.getCommands().some((command) => command.name === "agent")) {
        ctx.ui.notify("/agent is unavailable. Enable pi-agent-router first.", "warning");
        return;
      }
      pi.sendUserMessage("/agent", { expandPromptTemplates: true });
    },
  });
}
