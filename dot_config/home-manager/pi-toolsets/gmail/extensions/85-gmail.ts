import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const path = process.env.GMAIL_MCP_CLIENT_SECRET_PATH ??
    join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "pi-gmail", "client_secret.json");
  let client: { client_id: string; client_secret: string } | undefined;
  try {
    const web = JSON.parse(readFileSync(path, "utf8")).web;
    if (typeof web?.client_id !== "string" || !web.client_id.trim() ||
        typeof web?.client_secret !== "string" || !web.client_secret.trim() ||
        !Array.isArray(web.redirect_uris) ||
        !web.redirect_uris.includes("http://127.0.0.1:8766/callback")) {
      throw new Error("Invalid OAuth client configuration");
    }
    client = { client_id: web.client_id, client_secret: web.client_secret };
  } catch {
    // Never expose JSON contents, parser errors, or secrets to the chat/log.
    pi.on("session_start", async (_event, ctx) => {
      if (ctx.hasUI) ctx.ui.notify(
        "Gmail MCP は未設定です。~/.config/pi-gmail/client_secret.json に Web application の OAuth JSON（redirect URI: http://127.0.0.1:8766/callback）を保存して /reload してください。GMAIL_MCP_CLIENT_SECRET_PATH による指定も可能です。",
        "warning",
      );
    });
  }

  pi.registerMcpServer("gmail", {
    url: "https://gmailmcp.googleapis.com/mcp/v1",
    enabled: client !== undefined,
    description: "Google official Gmail MCP: search/read mail and create drafts on request. Sending and label changes are not exposed.",
    exposure: "hidden",
    toolExposure: {
      search_threads: "codemode",
      get_thread: "codemode",
      get_message: "codemode",
      list_drafts: "codemode",
      list_labels: "codemode",
      create_draft: "codemode",
    },
    oauth: {
      ...(client ? { clientId: client.client_id, clientSecret: client.client_secret } : {}),
      callbackUrl: "http://127.0.0.1:8766/callback",
      scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
      authServerMetadataUrl: "https://accounts.google.com/.well-known/openid-configuration",
    },
  });
}
