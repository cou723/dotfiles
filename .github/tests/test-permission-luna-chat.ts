import assert from "node:assert/strict";
import registerLuna from "../../dot_pi/agent/extensions/20-permission-luna-chat.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Offline regression test, loaded through Pi's normal extension module mapping. */
export default function (pi: ExtensionAPI) {
  pi.registerCommand("test-permission-luna-chat", {
    description: "Offline tests for the chat-only reviewer alias; no model requests",
    handler: async () => {
      let providerName: string | undefined;
      let provider: any;
      const handlers: Record<string, Function> = {};
      registerLuna({
        registerProvider(name: string, config: unknown) { providerName = name; provider = config; },
        on(name: string, callback: Function) { handlers[name] = callback; },
      } as any);
      assert.equal(providerName, "permission-chat");
      assert.equal(provider.models.length, 1);
      assert.equal(provider.models[0].type, "chat");
      assert.equal(provider.models[0].id, "luna");
      assert.throws(() => provider.streamSimple({}, { messages: [] }), /not initialized/);
      const physical = { provider: "openai", id: "gpt-6-luna" };
      let authAvailable = true;
      let delegated: any;
      const registry = {
        find(p: string, id: string) { assert.equal(p, "openai"); assert.equal(id, "gpt-6-luna"); return physical; },
        hasConfiguredAuth(model: unknown) { assert.equal(model, physical); return authAvailable; },
        streamSimple(model: unknown, context: unknown, options: unknown) { delegated = { model, context, options }; return "test-stream"; },
      };
      handlers.session_start({}, { modelRegistry: registry });
      const context = { messages: [
        { role: "system", content: "Existing safety policy must remain intact." },
        { role: "user", content: "A harmless test request." },
      ] };
      const controller = new AbortController();
      const result = provider.streamSimple({}, context, {
        apiKey: "FAKE_ALIAS_MARKER", headers: { test: "FAKE_HEADER" }, env: { test: "FAKE_ENV" },
        maxTokens: 512, reasoning: "high", signal: controller.signal,
      });
      assert.equal(result, "test-stream");
      assert.equal(delegated.model, physical);
      assert.notEqual(delegated.context, context);
      assert.deepEqual(delegated.context.messages.slice(0, -1), context.messages);
      assert.equal(context.messages.length, 2, "Input context must not be mutated");
      const language = delegated.context.messages.at(-1);
      assert.equal(language.role, "system");
      assert(language.content.includes("短い日本語"));
      assert(language.content.includes("<verdict>allow|ask|deny</verdict>"));
      assert(language.content.includes("For explicitly requested, task-scoped work"));
      assert(language.content.includes("ordinary Pi configuration"));
      assert(language.content.includes("Do not ask solely because of that location"));
      assert(language.content.includes("Directory names and non-secret metadata are not secret contents"));
      assert(language.content.includes("Never authorize accessing or exposing credentials"));
      assert(language.content.includes("auth.json, mcp-auth.json"));
      assert(language.content.includes("changing, disabling, removing, or bypassing the permission gate"));
      assert(language.content.includes("including via package lists, loading settings, or symlinks"));
      assert(language.content.includes("Do not override deterministic security protections"));
      assert.equal(delegated.options.reasoning, "off");
      assert.equal(delegated.options.maxTokens, 512);
      assert(!("apiKey" in delegated.options));
      assert(!("headers" in delegated.options));
      assert(!("env" in delegated.options));
      assert(delegated.options.signal instanceof AbortSignal);
      controller.abort();
      assert(delegated.options.signal.aborted);
      authAvailable = false;
      assert.throws(() => provider.streamSimple({}, context), /authentication is unavailable/);
      handlers.session_shutdown();
      assert.throws(() => provider.streamSimple({}, context), /not initialized/);
      console.log("PASS: chat-only metadata, delegation, auth isolation, thinking off, cancellation, missing auth, shutdown");
    },
  });
}
