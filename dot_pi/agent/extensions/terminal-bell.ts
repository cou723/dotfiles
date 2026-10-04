import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function ringBell(ctx: ExtensionContext): void {
	// BEL must not contaminate RPC/JSON output or redirected stdout.
	if (ctx.mode === "tui" && process.stdout.isTTY) {
		process.stdout.write("\x07");
	}
}

export default function terminalBell(pi: ExtensionAPI): void {
	// agent_end can precede automatic retries, compaction, or queued work.
	pi.on("agent_settled", (_event, ctx) => ringBell(ctx));

	pi.on("tool_execution_start", (event, ctx) => {
		if (event.toolName === "ask_question") ringBell(ctx);
	});

	pi.registerCommand("bell-test", {
		description: "Test the terminal notification bell",
		handler: async (_args, ctx) => {
			ringBell(ctx);
			ctx.ui.notify("通知ベルを送信しました。", "info");
		},
	});
}
