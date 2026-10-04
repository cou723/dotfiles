import {
  createReadToolDefinition, createGrepToolDefinition, createFindToolDefinition,
  createLsToolDefinition, createEditToolDefinition, createWriteToolDefinition,
  createBashToolDefinition, getAgentDir, getPackageDir, parseFrontmatter, withFileMutationQueue,
  type ExtensionAPI, type ExtensionContext, type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BubblewrapBackend, type BackendConfig } from "./backend.ts";
import { canonical, compose, expand, inside, parseScope, permitted, type Scope } from "./policy.ts";
import { Type } from "typebox";
import { applyProtectedPaths, applyTargets, parseMaintenance, type MaintenanceConfig } from "./maintenance.ts";
import { protectedWritePaths, resolvePolicy, snapshotDefinitions, type AgentPolicy, type Definitions } from "./definitions.ts";
import { getSubagentsService } from "@gotgenes/pi-subagents";
import { assertDelegationAllowed, DELEGATION_TOOLS, type AgentRecordLookup } from "./delegation.ts";

const FACTORIES = { read: createReadToolDefinition, grep: createGrepToolDefinition,
  find: createFindToolDefinition, ls: createLsToolDefinition, edit: createEditToolDefinition,
  write: createWriteToolDefinition, bash: createBashToolDefinition };
type ToolName = keyof typeof FACTORIES;
const TOOLS = Object.keys(FACTORIES) as ToolName[];
const WRITERS = new Set(["edit", "write"]);
const KEY = Symbol.for("local-pi-sandbox-ceiling.sessions.v2");
type SessionState = { policies: Map<string, AgentPolicy | Error>; invocation?: Scope; ready: boolean; child?: boolean; maintenance?: MaintenanceConfig };
const sessions: Map<string, SessionState> = ((globalThis as any)[KEY] ??= new Map());

export function activeIdentity(ctx: Pick<ExtensionContext, "sessionManager" | "getSystemPrompt">): string | null {
  // A child prompt tag is authoritative over any copied parent history.
  const tag = /<active_agent\s+name=["']([^"']+)["'][^>]*>/i.exec(ctx.getSystemPrompt());
  const branch = ctx.sessionManager.getBranch();
  const entry = [...branch].reverse().find(item => item.type === "custom" && item.customType === "active_agent");
  // The router's persisted selection is authoritative for a primary session.
  if (entry && entry.type === "custom") {
    const name = (entry.data as { name?: unknown })?.name;
    return typeof name === "string" ? name : null;
  }
  return tag?.[1] ?? null;
}

export default function sandboxCeiling(pi: ExtensionAPI): void {
  const extensionDir = path.dirname(fileURLToPath(import.meta.url));
  const sdkEntry = path.join(getPackageDir(), "dist", "index.js");
  let backend: BubblewrapBackend | undefined;
  let currentSessionId: string | undefined;
  let configError: string | undefined;
  let subagentRecords: AgentRecordLookup | undefined;
  const parseDefinition = (text: string) => parseFrontmatter<Record<string, unknown>>(text).frontmatter;
  const globalDefinitions = snapshotDefinitions(path.join(getAgentDir(), "agents"), parseDefinition);
  const projectDefinitions = new Map<string, Definitions>();

  function state(ctx: ExtensionContext): SessionState {
    const value = sessions.get(ctx.sessionManager.getSessionId());
    if (!value?.ready || !backend) throw new Error(configError ?? "Filesystem sandbox is not initialized");
    return value;
  }

  function policy(ctx: ExtensionContext): AgentPolicy {
    const identity = activeIdentity(ctx);
    if (!identity) throw new Error("Select an Agent with /agent before using filesystem tools");
    const value = state(ctx).policies.get(identity);
    if (value instanceof Error) throw value;
    if (!value) throw new Error("Unknown agent policy: " + identity);
    return value;
  }

  function protectedWrite(ctx: ExtensionContext): string[] {
    return protectedWritePaths(getAgentDir(), extensionDir, ctx.cwd, policy(ctx).projectConfigWrite, !!state(ctx).child);
  }

  function effective(ctx: ExtensionContext): Scope {
    const current = state(ctx);
    const { scope } = policy(ctx);
    const narrowed = current.invocation ? compose(scope, current.invocation) : scope;
    return { read: narrowed.read, write: narrowed.write.filter(root =>
      !protectedWrite(ctx).some(protectedRoot => inside(protectedRoot, root))) };
  }

  function maintenance(ctx: ExtensionContext): MaintenanceConfig {
    const current = state(ctx);
    if (current.child || !current.maintenance || !policy(ctx).configApply) {
      throw new Error("Global apply requires a primary session and a global pi_config_apply capability");
    }
    return current.maintenance;
  }

  function applyScope(ctx: ExtensionContext): { config: MaintenanceConfig; scope: Scope } {
    const config = maintenance(ctx);
    const ordinary = effective(ctx);
    if (!ordinary.read.some(root => inside(root, config.sourceDir))
      || !ordinary.read.some(root => inside(root, config.agentDir))
      || !ordinary.write.some(root => inside(root, config.sourceAgentDir))) {
      throw new Error("Agent scope or invocation narrowing forbids global apply");
    }
    const scope: Scope = { read: [canonical(ctx.cwd), config.sourceDir, config.agentDir], write: [config.agentDir] };
    return { config, scope };
  }

  pi.on("session_start", (_event, ctx) => {
    currentSessionId = ctx.sessionManager.getSessionId();
    try {
      const config = JSON.parse(readFileSync(path.join(getAgentDir(), "sandbox-ceiling.json"), "utf8"));
      if (config.version !== 1 || config.backend !== "bubblewrap") throw new Error("Unsupported sandbox config");
      const inherited = sessions.get(currentSessionId);
      // Child factories publish their own service globally; retain this runtime's original parent lookup.
      subagentRecords ??= getSubagentsService();
      const maintenanceConfig = config.maintenance
        ? parseMaintenance(config.maintenance, ctx.cwd, getAgentDir()) : undefined;
      if (!projectDefinitions.has(ctx.cwd)) {
        projectDefinitions.set(ctx.cwd, ctx.isProjectTrusted()
          ? snapshotDefinitions(path.join(ctx.cwd, ".pi", "agents"), parseDefinition) : new Map());
      }
      if (!Array.isArray(config.runtimeRead) || config.runtimeRead.some((value: unknown) => typeof value !== "string")) {
        throw new Error("runtimeRead requires literal path strings");
      }
      const protectedWrite = protectedWritePaths(getAgentDir(), extensionDir, ctx.cwd, false, !!inherited?.child);
      const runtimeRead = [...new Set([
        ...config.runtimeRead.map((raw: string) => expand(raw, ctx.cwd)).filter(existsSync),
        extensionDir, path.join(getAgentDir(), "bin"),
      ].filter(existsSync))];
      const backendConfig: BackendConfig = {
        executable: expand(config.executable, ctx.cwd), runtimeRead, protectedWrite,
        timeoutMs: config.timeoutMs ?? 600000,
      };
      if (!Number.isSafeInteger(backendConfig.timeoutMs) || backendConfig.timeoutMs < 1000) throw new Error("Invalid timeoutMs");
      backend = new BubblewrapBackend(backendConfig);
      const saved = [...ctx.sessionManager.getBranch()].reverse().find(entry => entry.type === "custom" && entry.customType === "sandbox_narrow");
      const invocation = saved?.type === "custom" ? parseScope(saved.data, ctx.cwd) : inherited?.invocation;
      const local = projectDefinitions.get(ctx.cwd)!;
      const policies = new Map<string, AgentPolicy | Error>();
      for (const name of new Set([...globalDefinitions.keys(), ...local.keys()])) {
        try { policies.set(name, resolvePolicy(name, ctx.cwd, globalDefinitions, local)); }
        catch (error) { policies.set(name, new Error(String(error))); }
      }
      sessions.set(currentSessionId, { policies, invocation, ready: true, child: inherited?.child, maintenance: maintenanceConfig });
      configError = undefined;
    } catch (error) {
      backend = undefined;
      configError = String(error);
      ctx.ui.notify("[sandbox-ceiling] FAIL CLOSED: " + configError, "error");
    }
  });

  pi.events.on("subagents:child:session-created", (raw: unknown) => {
    const event = raw as { sessionId: string; parentSessionId?: string };
    const parent = sessions.get(event.parentSessionId ?? "");
    if (parent) sessions.set(event.sessionId, { policies: new Map(), ready: false, child: true });
  });
  pi.events.on("subagents:child:disposed", (raw: unknown) => {
    sessions.delete((raw as { sessionId: string }).sessionId);
  });
  // Trusted launchers can narrow an individual child without borrowing parent authority.
  pi.events.on("sandbox-ceiling:invocation-narrow", (raw: unknown) => {
    const event = raw as { sessionId: string; cwd: string; sandbox: unknown };
    const current = sessions.get(event.sessionId);
    if (!current) throw new Error("Unknown sandbox session");
    const requested = parseScope(event.sandbox, event.cwd);
    current.invocation = current.invocation ? compose(current.invocation, requested) : requested;
  });

  pi.registerCommand("sandbox-status", {
    description: "Show the current principal and filesystem ceiling",
    handler: async (_args, ctx) => {
      try { ctx.ui.notify(JSON.stringify({ agent: activeIdentity(ctx), allowedAgents: policy(ctx).allowedAgents, configApply: !state(ctx).child && !!state(ctx).maintenance && policy(ctx).configApply, projectConfigWrite: !state(ctx).child && policy(ctx).projectConfigWrite, ...effective(ctx) }, null, 2), "info"); }
      catch (error) { ctx.ui.notify(String(error), "error"); }
    },
  });
  pi.registerCommand("sandbox-narrow", {
    description: 'Narrow this invocation: {"read":["${cwd}"],"write":[]}',
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      const current = state(ctx);
      const requested = parseScope(JSON.parse(args), ctx.cwd);
      const invocation = current.invocation ? compose(current.invocation, requested) : requested;
      current.invocation = invocation;
      pi.appendEntry("sandbox_narrow", invocation);
      ctx.ui.notify("Filesystem scope narrowed for this session; children keep their own scope.", "info");
    },
  });

  pi.registerTool({
    name: "pi_config_apply", label: "Apply managed Pi configuration",
    description: "Apply selected chezmoi targets to the global Pi agent directory. Requires a primary session and a trusted global Agent declaring capabilities: [pi_config_apply]. Targets are relative paths, e.g. settings.json or agents/worker.md. Preview with dryRun:true. overwrite:true explicitly allows replacing differing targets; check existing changes first. No scripts/hooks or unrestricted apply.",
    parameters: Type.Object({ targets: Type.Array(Type.String(), { minItems: 1, maxItems: 32 }),
      dryRun: Type.Optional(Type.Boolean()), overwrite: Type.Optional(Type.Boolean()) }),
    async execute(_id, input, signal, _onUpdate, ctx) {
      const { config, scope } = applyScope(ctx);
      const targets = applyTargets(input.targets, config);
      const applyBackend = new BubblewrapBackend({ ...backend!.config,
        runtimeRead: backend!.config.runtimeRead.filter(root => canonical(root) !== canonical(extensionDir)),
        protectedWrite: applyProtectedPaths(config) });
      return withFileMutationQueue(config.agentDir, async () => {
        const output = await applyBackend.run(scope, ctx.cwd,
          [process.execPath, path.join(extensionDir, "apply-runner.mjs")],
          JSON.stringify({ executable: config.executable, sourceDir: config.sourceDir,
            homeDir: homedir(), targets, dryRun: input.dryRun === true, overwrite: input.overwrite === true }), signal);
        const response = JSON.parse(output);
        if (response.error) throw new Error(response.error);
        return { content: [{ type: "text" as const, text: response.output ||
          `chezmoi ${input.dryRun ? "preview" : "apply"} completed: ${input.targets.join(", ")}. ${!input.overwrite ? "Existing differences may be skipped; verify targets. " : ""}Restart Pi to activate configuration changes.` }], details: undefined };
      });
    },
  });

  pi.on("tool_call", (event, ctx) => {
    if (DELEGATION_TOOLS.has(event.toolName)) {
      try {
        const current = state(ctx);
        if (current.child) throw new Error("Child agents may not delegate or control other agents");
        const caller = activeIdentity(ctx);
        if (!caller) throw new Error("Select an Agent with /agent before delegating");
        assertDelegationAllowed(caller, policy(ctx).allowedAgents, event.toolName, event.input, current.policies, subagentRecords);
      } catch (error) {
        return { block: true, reason: "[sandbox-ceiling] " + String(error) };
      }
      return;
    }
    if (event.toolName === "pi_config_apply") {
      try { const { config } = applyScope(ctx); applyTargets((event.input as { targets: string[] }).targets, config); }
      catch (error) { return { block: true, reason: "[sandbox-ceiling] " + String(error) }; }
      return;
    }
    if (!TOOLS.includes(event.toolName as ToolName)) return;
    try {
      const scope = effective(ctx);
      if (event.toolName !== "bash") {
        const input = event.input as { path?: string };
        const target = permitted(input.path ?? ".", ctx.cwd, WRITERS.has(event.toolName) ? scope.write : scope.read);
        if (WRITERS.has(event.toolName) && protectedWrite(ctx).some(root => inside(root, target))) {
          throw new Error("Sandbox policy/runtime paths are immutable");
        }
      }
    } catch (error) {
      return { block: true, reason: "[sandbox-ceiling] " + String(error) };
    }
  });

  for (const name of TOOLS) {
    const original: ToolDefinition<any, any> = FACTORIES[name](process.cwd());
    pi.registerTool({
      ...original,
      async execute(id, input, signal, _onUpdate, ctx) {
        const scope = effective(ctx);
        const run = async () => {
          const toolBackend = new BubblewrapBackend({ ...backend!.config, protectedWrite: protectedWrite(ctx) });
          const output = await toolBackend.run(scope, ctx.cwd,
            [process.execPath, path.join(extensionDir, "runner.mjs")],
            JSON.stringify({ sdkEntry, cwd: ctx.cwd, tool: name, id, input }), signal);
          const response = JSON.parse(output);
          if (response.error) throw new Error(response.error);
          if (!response.result || !Array.isArray(response.result.content)) throw new Error("Invalid sandbox tool result");
          return response.result;
        };
        if (WRITERS.has(name)) {
          const target = permitted((input as { path: string }).path, ctx.cwd, scope.write);
          // Subprocess-local queues cannot serialize sibling Pi tool calls.
          return withFileMutationQueue(target, run);
        }
        return run();
      },
    });
  }
  pi.on("session_shutdown", () => {
    if (currentSessionId) sessions.delete(currentSessionId);
    backend = undefined;
  });
}
