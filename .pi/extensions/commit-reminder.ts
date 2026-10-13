import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { ReminderState, reminder, snapshot } from "../lib/commit-reminder.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default function (pi: ExtensionAPI) {
  const state = new ReminderState();
  let warned = false;
  const entry = () => ({
    type: "custom_message" as const,
    customType: "commit-reminder",
    content: reminder,
    display: true,
  });
  async function inspect(ctx: { cwd: string; hasUI: boolean; ui: { notify: Function } }) {
    try { return await snapshot(ctx.cwd, root); }
    catch {
      if (!warned && ctx.hasUI) ctx.ui.notify("コミット確認フック: Git差分の確認に失敗しました。手動で確認してください。", "warning");
      warned = true;
      return null;
    }
  }
  pi.on("session_start", async (_event, ctx) => {
    state.initialize(await inspect(ctx));
  });
  pi.on("before_agent_start", () => { state.start(); });
  pi.on("turn_end", async (event, ctx) => {
    if (event.outcome !== "completed") return;
    if (state.observe(await inspect(ctx))) return { entries: [...event.entries, entry()] };
  });
  pi.on("agent_before_settle", async (event, ctx) => {
    if (event.outcome !== "completed") return;
    const fingerprint = await inspect(ctx);
    if (fingerprint === null) return;
    // A turn_end notification already consumes the prompt's allowance.
    // Only a first change discovered at settlement can request an extra run.
    if (!state.observe(fingerprint)) return;
    return {
      entries: [...event.entries, entry()],
      ...(event.context.canContinue ? { continue: true } : {}),
    };
  });
}
