import { Type } from "typebox";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
// Internal API, deliberately pinned to pi-perm 0.1.8. Do not update without tests.
import { createPiPermExtension } from "pi-perm/core/extension.ts";
import { registerPermissionUI } from "./ui.ts";

export default function permissionExtension(pi: ExtensionAPI) {
  const require = createRequire(import.meta.url);
  const extensionRoot = dirname(require.resolve("pi-perm/package.json"));
  const core = createPiPermExtension({ extensionRoot, events: pi.events });
  // Keep srt local to this package; no global PATH or global npm install needed.
  core.state.config.tools.bash.srtBinary = join(dirname(require.resolve("@anthropic-ai/sandbox-runtime/package.json")), "dist/cli.js");
  pi.registerTool(createBashToolDefinition(core.state.cwd, {
    spawnHook: core.createBashSpawnHook(),
  }));
  pi.on("tool_call", (event, ctx) => core.handleToolCall(event, ctx));
  pi.registerTool({
    name: "pi_perm_policy",
    label: "Pi Perm Policy",
    description: "Read-only summary of the active permission policy. Cannot change permissions.",
    parameters: Type.Object({}),
    async execute() {
      return {
        content: [{ type: "text", text: JSON.stringify(core.policySummary(), null, 2) }],
        details: { readOnly: true },
      };
    },
  });
  registerPermissionUI(pi, core);
}
