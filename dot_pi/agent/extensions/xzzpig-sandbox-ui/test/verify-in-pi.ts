// Explicit test entry point. Registers the production extension exactly once.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSandboxService } from "@xzzpig/pi-sandbox";
import { existsSync } from "node:fs";
import { join } from "node:path";
import registerExtension from "../index.ts";

export default function (pi: ExtensionAPI) {
  const tools = new Map<string, any>();
  const gates: any[] = [];
  registerExtension(new Proxy(pi, {
    get(target, key) {
      if (key === "registerTool") return (tool: any) => { tools.set(tool.name, tool); pi.registerTool(tool); };
      if (key === "on") return (event: any, handler: any) => {
        if (event === "tool_call") gates.push(handler);
        return pi.on(event, handler);
      };
      return Reflect.get(target, key);
    },
  }));
  pi.registerCommand("verify-sandbox", {
    description: "Check real sandbox in a disposable workspace",
    async handler(_args, ctx) {
      const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
      const execute = async (name: string, input: any) => {
        for (const gate of gates) {
          const result = await gate({ type: "tool_call", toolName: name, toolCallId: "verify", input }, ctx);
          if (result?.block) return { isError: true, content: [{ type: "text", text: result.reason }] };
        }
        if (name === "read") return { isError: false, content: [] }; // Test the native read gate only.
        const tool = tools.get(name);
        check(tool, `missing tool ${name}`);
        return tool.execute("verify", input, undefined, undefined, ctx);
      };
      const service = getSandboxService(ctx.sessionManager.getSessionId());
      check(service, "sandbox service unavailable");
      check(service!.getProfile() === "workspace", "startup profile is not workspace");
      const allowed = await execute("bash", { command: "printf ok > allowed.txt", timeout: 5 });
      check(existsSync(join(ctx.cwd, "allowed.txt")), `workspace write failed: ${JSON.stringify(allowed)}`);
      await execute("bash", { command: "printf blocked > ../outside.txt", timeout: 5 });
      check(!existsSync(join(ctx.cwd, "..", "outside.txt")), "outside redirection escaped sandbox");
      await execute("bash", { command: "printf blocked | tee ../pipeline.txt", timeout: 5 });
      check(!existsSync(join(ctx.cwd, "..", "pipeline.txt")), "pipeline escaped sandbox");
      const deniedRead = await execute("bash", { command: "cat .env", timeout: 5 });
      check(!JSON.stringify(deniedRead.content).includes("TEST_ONLY_NOT_A_SECRET"), "bash env read was allowed");
      const nativeRead = await execute("read", { path: ".env" });
      check(nativeRead.isError, "native read gate did not block .env");
      const invalid = await service!.setProfile("unknown-profile");
      check(!invalid.ok && service!.getProfile() === "workspace", "unknown profile changed state");
      const changed = await service!.setProfile("review");
      check(changed.ok, changed.message ?? "review switch failed");
      await execute("bash", { command: "printf blocked > readonly.txt", timeout: 5 });
      check(!existsSync(join(ctx.cwd, "readonly.txt")), "review profile allowed writes");
      const restored = await service!.setProfile("workspace");
      check(restored.ok, "restore workspace failed");
      await execute("bash", { command: "printf ok > restored.txt", timeout: 5 });
      check(existsSync(join(ctx.cwd, "restored.txt")), "profile restore did not take effect");
      console.log("PASS: real sandbox, native read gate and profile switching");
    },
  });
}
