import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runHeadlessModel } from "../node_modules/@agwab/pi-subagent/src/runners/headless-model.ts";
import { loadRegistry, validateRequest, prepareJob, childEnvironment, boundedOutput } from "./policy.ts";

const config = Object.freeze(JSON.parse(readFileSync(new URL("./runtime-config.json", import.meta.url), "utf8")));

export default async function definedSubagents(pi: ExtensionAPI) {
  // Load global user configuration once per factory/reload and freeze the policy snapshot.
  // No cwd lookup, project shadowing, bundled defaults or caller overrides.
  const sourceAgentDir = process.env.PI_CODING_AGENT_DIR
    ? resolve(process.env.PI_CODING_AGENT_DIR) : join(homedir(), ".pi", "agent");
  const registry = await loadRegistry(join(sourceAgentDir, "agents"));
  let active = false;
  pi.registerCommand("defined-agents", {
    description: "List trusted sub-agent definitions and enabled/draft status",
    handler: async (_args, ctx) => {
      const message = [...registry.values()].map(def => `${def.name}: ${def.enabled ? "enabled" : "disabled draft"}\n  ${def.description}`).join("\n");
      ctx.ui.notify(message, "info");
    },
  });
  pi.registerTool({
    name: "subagent",
    label: "Defined sub-agent",
    description: "Delegate a bounded task using a required trusted global definition. Only {agent, task} accepted; tools, cwd, sandbox, model and prompts cannot be overridden. The worker's logs stay in artifacts; only a short final result is returned. Synchronous only; no nested delegation API, background jobs, resume or caller-defined workflows. Definitions: " +
      [...registry.values()].map(def => `${def.name} (${def.enabled ? "enabled" : "disabled"}): ${def.description.slice(0, 180)}`).join("; "),
    parameters: Type.Object({
      agent: Type.Union([...registry.keys()].map(name => Type.Literal(name))),
      task: Type.String({ minLength: 1, maxLength: 16000 }),
    }, { additionalProperties: false }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const { definition, task } = validateRequest(params, registry);
      if (active) throw new Error("A defined sub-agent is already running in this Pi process.");
      if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
      if (!ctx.model) throw new Error("Select a parent model before delegation.");
      active = true;
      let job: Awaited<ReturnType<typeof prepareJob>> | undefined;
      try {
        job = await prepareJob(homedir(), sourceAgentDir);
        const result = await runHeadlessModel({
          agent: definition.name,
          task: `Parent working directory (read-only context): ${JSON.stringify(ctx.cwd)}\n\n${task}`,
          cwd: job.workspace,
          // Parent-owned artifacts outside the only writable mount. Child cannot replace
          // log/output paths with symlinks to trick parent-side writes after exit.
          artifactCwd: job.job,
          runsDir: join(job.job, "artifacts"),
          piCommand: config.pi,
          sandbox: { allowedDomains: ["*"] },
          model: `${ctx.model.provider}/${ctx.model.id}`,
          tools: [...definition.tools],
          systemPrompt: definition.prompt,
          skills: [], extensions: [], captureToolCalls: true,
          timeoutMs: definition.timeoutMs, signal,
          childEnv: childEnvironment(job),
        });
        const output = result.artifacts.find(ref => ref.type === "output");
        const summary = output ? await boundedOutput(join(job.job, output.path), definition.resultMaxChars) : "";
        const text = [
          `${definition.name}: ${result.status}${result.failureKind ? ` (${result.failureKind})` : ""}`,
          summary || "No final summary. Inspect artifacts for failure details.",
          `Artifacts: ${join(job.job, "artifacts")}`,
        ].join("\n\n");
        // Never put the upstream envelope, tool-call traces or definition body in tool results.
        return { content: [{ type: "text" as const, text }], isError: result.status !== "completed",
          details: { agent: definition.name, status: result.status, failureKind: result.failureKind,
            artifacts: join(job.job, "artifacts"), sandbox: "linux-bubblewrap/workspace-only/network-unrestricted" } };
      } finally {
        active = false;
        // Do not retain auth/model snapshots with research artifacts. rm does not follow a
        // replaced runtime symlink. Caller cancellation and failed launches also come here.
        if (job) await rm(job.runtime, { recursive: true, force: true });
      }
    },
  });
}
