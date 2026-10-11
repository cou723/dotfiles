import { getModel } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const REVIEW_GUIDANCE =
  "判定理由は短い日本語で書いてください。" +
  " Keep the exact <verdict>allow|ask|deny</verdict> format and English verdict values;" +
  " only the explanatory reason after the tag must be Japanese." +
  " For explicitly requested, task-scoped work, ordinary directory inspection and changes to" +
  " ordinary Pi configuration (settings.json, non-secret MCP settings, and skills) are authorized" +
  " even under ~/.pi or ~/.config or outside the working directory." +
  " Do not ask solely because of that location. Directory names and non-secret metadata are not secret contents." +
  " This is not blanket authorization: evaluate actual effects and user intent; ask for ambiguous intent" +
  " or consequential changes such as installing executable extensions or changing remote services." +
  " Never authorize accessing or exposing credentials, tokens, private keys, auth.json, mcp-auth.json," +
  " secret-bearing .env files, or other secret contents." +
  " Never authorize changing, disabling, removing, or bypassing the permission gate, its rules," +
  " or its reviewer code/prompts, including via package lists, loading settings, or symlinks." +
  " Do not override deterministic security protections or existing secret/self-protection rules.";

/** Chat-only alias: pi-verdict otherwise prefers Luna's same-ID Decisions API. */
export default function registerPermissionLuna(pi: ExtensionAPI) {
  let registry: ExtensionContext["modelRegistry"] | undefined;
  const physical = getModel("openai", "gpt-6-luna");

  pi.registerProvider("permission-chat", {
    api: "permission-chat-delegated",
    baseUrl: "https://api.openai.com/v1",
    // Public internal marker, not a credential; discarded before delegation.
    apiKey: "delegated-via-pi-runtime",
    models: [{
      type: "chat",
      id: "luna",
      name: "GPT-6 Luna (chat-only permission reviewer)",
      reasoning: physical.reasoning,
      input: physical.input,
      cost: physical.cost,
      contextWindow: physical.contextWindow,
      maxTokens: physical.maxTokens,
    }],
    streamSimple(_alias, context, options) {
      if (!registry) throw new Error("Pi model registry is not initialized");
      const chat = registry.find("openai", "gpt-6-luna");
      if (!chat || !registry.hasConfiguredAuth(chat)) {
        throw new Error("GPT-6 Luna chat authentication is unavailable");
      }
      // Pi resolves and refreshes the existing OpenAI credentials itself.
      // Never read auth.json, copy tokens, or forward alias credentials.
      const { apiKey: _key, headers: _headers, env: _env, ...forward } = options ?? {};
      const timeout = AbortSignal.timeout(15000);
      const signal = forward.signal ? AbortSignal.any([forward.signal, timeout]) : timeout;
      // Append user preferences; retain the original prompt and all security checks.
      const localizedContext = {
        ...context,
        messages: [...context.messages, { role: "system" as const, content: REVIEW_GUIDANCE }],
      };
      return registry.streamSimple(chat, localizedContext, { ...forward, signal, reasoning: "off" });
    },
  });

  pi.on("session_start", (_event, ctx) => { registry = ctx.modelRegistry; });
  pi.on("session_shutdown", () => { registry = undefined; });
}
