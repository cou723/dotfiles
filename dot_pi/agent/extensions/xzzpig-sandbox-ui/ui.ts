import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SandboxService } from "@xzzpig/pi-sandbox";

type Lookup = (id: string) => SandboxService | undefined;
const descriptions: Record<string, string> = {
  review: "読み取り専用・通信禁止",
  workspace: "作業領域の編集可・通信禁止",
  "workspace-network": "作業領域の編集可・npm と GitHub API の通信可",
};

export function registerSandboxPicker(pi: ExtensionAPI, lookup: Lookup) {
  let open = false;
  const idle = (ctx: ExtensionContext) => {
    if (ctx.isIdle()) return true;
    ctx.ui.notify("実行を停止してから切り替えてください（Esc で停止）。", "warning");
    return false;
  };
  const serviceFor = (ctx: ExtensionContext) => lookup(ctx.sessionManager.getSessionId());
  const apply = async (name: string, ctx: ExtensionContext) => {
    if (!idle(ctx)) return;
    const service = serviceFor(ctx);
    if (!service) return ctx.ui.notify("サンドボックスの切り替えAPIが利用できません。", "error");
    try {
      const result = await service.setProfile(name);
      ctx.ui.notify(result.message ?? (result.ok ? `Sandbox profile: ${name}` : "切り替えに失敗しました。"),
        !result.ok ? "error" : result.message ? "warning" : "info");
      // Actual enforcing status is maintained by pi-sandbox, not this UI.
    } catch (error) {
      ctx.ui.notify(`切り替えに失敗しました: ${String(error)}`, "error");
    }
  };
  const picker = async (ctx: ExtensionContext) => {
    if (open || !idle(ctx)) return;
    if (!ctx.hasUI) return;
    const service = serviceFor(ctx);
    if (!service) return ctx.ui.notify("サンドボックスの切り替えAPIが利用できません。", "error");
    open = true;
    try {
      const current = service.getProfile();
      const names = [...service.listProfiles()].sort((a, b) => a === current ? -1 : b === current ? 1 : a.localeCompare(b));
      const choices = names.map(name => `${name === current ? "●" : "○"} ${name}${descriptions[name] ? `：${descriptions[name]}` : ""}`);
      if (!choices.length) return ctx.ui.notify("sandbox.json にプロファイルを定義してください。", "warning");
      const selected = await ctx.ui.select("Sandbox profile · ↑↓ 選択 / Enter 適用 / Esc キャンセル", choices);
      const index = selected === undefined ? -1 : choices.indexOf(selected);
      if (index >= 0 && names[index] !== service.getProfile()) await apply(names[index], ctx);
    } finally { open = false; }
  };
  pi.registerShortcut("alt+a", { description: "Choose sandbox profile", handler: picker });
  pi.registerCommand("sandbox-profile", {
    description: "Choose sandbox profile, or /sandbox-profile <name>",
    async handler(args, ctx) {
      const name = args.trim();
      if (name) await apply(name, ctx);
      else await picker(ctx);
    },
  });
}
