import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type PermissionCore = {
  state: { config: { profiles?: Record<string, { description?: string }> } };
  policySummary(): { activeProfile: string; profiles: string[] };
  handlePiPermCommand(args: string, ctx: ExtensionContext): unknown;
};

/** UI only: all policy changes go through pi-perm's existing switch handler. */
export function registerPermissionUI(pi: ExtensionAPI, core: PermissionCore) {
  let pickerOpen = false;
  const updateStatus = (ctx: ExtensionContext) => {
    ctx.ui.setStatus("pi-perm", `Permissions: ${core.policySummary().activeProfile}`);
  };
  const canSwitch = (ctx: ExtensionContext) => {
    if (ctx.isIdle()) return true;
    ctx.ui.notify("権限の切り替えは実行停止後に行ってください（Esc で停止）。", "warning");
    return false;
  };
  const showPicker = async (ctx: ExtensionContext) => {
    if (pickerOpen || !canSwitch(ctx)) return;
    if (!ctx.hasUI) {
      ctx.ui.notify("UI がありません。/pi-perm use <profile> を使ってください。", "warning");
      return;
    }
    pickerOpen = true;
    try {
      const summary = core.policySummary();
      const names = [...summary.profiles].sort((a, b) =>
        a === summary.activeProfile ? -1 : b === summary.activeProfile ? 1 : a.localeCompare(b));
      const choices = names.map(name => {
        const description = core.state.config.profiles?.[name]?.description;
        return `${name === summary.activeProfile ? "●" : "○"} ${name}${description ? ` — ${description}` : ""}`;
      });
      const selected = await ctx.ui.select("Permission profile · ↑↓ 選択 / Enter 決定 / Esc キャンセル", choices);
      if (selected === undefined || !canSwitch(ctx)) return;
      const index = choices.indexOf(selected);
      if (index < 0 || names[index] === core.policySummary().activeProfile) return;
      const name = names[index];
      if (name === ":danger-full-access" &&
          !(await ctx.ui.confirm("制限を解除しますか？", "全ファイルへの書き込みとネットワークアクセスを許可します。"))) return;
      if (!canSwitch(ctx)) return;
      core.handlePiPermCommand(`use ${name}`, ctx);
      updateStatus(ctx);
    } finally {
      pickerOpen = false;
    }
  };
  pi.registerShortcut("alt+a", {
    description: "Choose pi-perm permission profile",
    handler: showPicker,
  });
  pi.registerCommand("pi-perm", {
    description: "Choose permission profile, or list / use <profile> / status / audit",
    getArgumentCompletions(prefix) {
      const candidates = prefix.startsWith("use ")
        ? core.policySummary().profiles.map(name => `use ${name}`)
        : ["list", "use ", "status", "audit"];
      return candidates.filter(value => value.startsWith(prefix)).map(value => ({ value, label: value }));
    },
    async handler(args, ctx) {
      const command = args.trim();
      if (!command) return showPicker(ctx);
      if (/^use(?:\s|$)/.test(command) && !canSwitch(ctx)) return;
      core.handlePiPermCommand(command === "status" ? "" : command, ctx);
      updateStatus(ctx);
    },
  });
  pi.on("session_start", (_event, ctx) => updateStatus(ctx));
}
