import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerShortcut("ctrl+z", {
    description: "Undo the last conversation turn (/undo)",
    handler: (ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("処理中です。Escape で中断してから Ctrl+Z を押してください。", "warning");
        return;
      }
      // Never send /undo to the model if the history extension is missing.
      if (!pi.getCommands().some((command) => command.name === "undo" && command.source === "extension")) {
        ctx.ui.notify("/undo 拡張が読み込まれていません。", "warning");
        return;
      }
      // Dispatch through Pi to obtain the command context (navigateTree, etc.).
      pi.sendUserMessage("/undo", { expandPromptTemplates: true });
    },
  });
}
