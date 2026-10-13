import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  pi.registerMcpServer("gmail", {
    command: "@gmailCommand@",
    exposure: "hidden",
    description: "Gmail: search and read messages/threads, retrieve attachments, create drafts and send only after human confirmation.",
    toolExposure: {
      start_google_auth: "codemode",
      search_gmail_messages: "codemode",
      get_gmail_message_content: "codemode",
      get_gmail_messages_content_batch: "codemode",
      get_gmail_thread_content: "codemode",
      get_gmail_threads_content_batch: "codemode",
      get_gmail_attachment_content: "codemode",
      draft_gmail_message: "codemode",
      send_gmail_message: "codemode",
    },
  });

  // MCP calls from codemode also pass through tool_call. No approval caching:
  // each attempt must be confirmed, even after a failed/ambiguous send.
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "mcp__gmail__send_gmail_message") return;
    if (!ctx.hasUI) {
      return { block: true, reason: "Gmail sending requires an interactive human confirmation." };
    }
    try {
      // JSON escapes control characters in untrusted addresses, subjects and bodies.
      const approved = await ctx.ui.confirm(
        "Gmail を送信しますか？（外部への送信・取り消し不可）",
        "以下の実際の引数を確認してください。承認はこの1回だけ有効です。\n\n" + JSON.stringify(event.input, null, 2),
      );
      if (approved !== true) return { block: true, reason: "Gmail send was not approved." };
    } catch {
      return { block: true, reason: "Gmail send confirmation failed; sending is blocked." };
    }
  });
}
