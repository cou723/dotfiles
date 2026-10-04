import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, cpSync, existsSync, readFileSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const extensionDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = mkdtempSync(path.join(tmpdir(), "pi-permission-integration-"));
const agentDir = path.join(fixture, "agent");
const cwd = path.join(fixture, "repo");
const originalCwd = process.cwd();
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const modules = process.env.POC_MODULES;
const sourceAgents = process.env.POC_AGENT_DEFINITIONS ?? path.resolve(extensionDir, "../../agents");
assert.ok(modules, "Set POC_MODULES to a node_modules containing the three pinned extensions and Pi");
for (const dir of [cwd, path.join(agentDir, "agents"), path.join(agentDir, "extensions")]) mkdirSync(dir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.chdir(cwd);
const packages = ["pi-agent-router", "@gotgenes/pi-subagents", "@gotgenes/pi-permission-system"].map(name => path.join(modules, name));
writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages, defaultProjectTrust: "never", defaultTools: ["+grep", "+find", "+ls", "+codemode"], compaction: { enabled: false }, retry: { enabled: false } }));
writeFileSync(path.join(agentDir, "subagents.json"), JSON.stringify({ excludedExtensionPackages: [packages[0]], defaultMaxTurns: 8 }));
for (const role of ["planner", "orchestrator", "worker", "reviewer", "researcher"]) copyFileSync(path.join(sourceAgents, role + ".md"), path.join(agentDir, "agents", role + ".md"));
const workerFile = path.join(agentDir, "agents", "worker.md");
writeFileSync(workerFile, readFileSync(workerFile, "utf8").replace("tools: read,", "tools: poc_ask, read,"));
cpSync(extensionDir, path.join(agentDir, "extensions", "sandbox-ceiling"), { recursive: true });
mkdirSync(path.join(agentDir, "extensions", "pi-permission-system"));
copyFileSync(process.env.POC_PERMISSION_CONFIG ?? path.resolve(sourceAgents, "../extensions/pi-permission-system/config.json"), path.join(agentDir, "extensions", "pi-permission-system", "config.json"));
const runtimeRead = ["/usr", "/bin", "/lib", "/lib64", "/nix/store", path.join(homedir(), ".nix-profile"), path.join(homedir(), ".local/share/pnpm/store"), path.join(homedir(), ".pi/agent/bin"), modules, extensionDir].filter(existsSync);
writeFileSync(path.join(agentDir, "sandbox-ceiling.json"), JSON.stringify({ version: 1, backend: "bubblewrap", executable: path.join(homedir(), ".nix-profile/bin/bwrap"), runtimeRead, timeoutMs: 20000 }));
writeFileSync(path.join(cwd, "file.txt"), "before");

const researchAllowed = [
  "web_enable", "web_search", "fetch_content", "get_search_content", "source_check",
  "mcp__context7__resolve_library_id", "mcp__context7__query_docs",
  ...[
    "get_file_contents", "get_commit", "list_commits", "search_commits", "list_branches",
    "list_tags", "get_tag", "get_latest_release", "get_release_by_tag", "list_releases",
    "search_code", "search_repositories", "list_issues", "search_issues", "issue_read",
    "get_label", "list_issue_types", "list_pull_requests", "search_pull_requests", "pull_request_read",
  ].map(name => "mcp__github__" + name),
];
const researchDenied = [
  "mcp", "list_mcp_resources", "read_mcp_resource", "list_mcp_resource_templates",
  "mcp__context7__future_tool", "mcp__todoist__find_tasks",
  ...[
    "create_branch", "create_repository", "fork_repository", "delete_file", "push_files",
    "create_or_update_file", "create_pull_request", "update_pull_request", "merge_pull_request",
    "update_pull_request_branch", "issue_write", "sub_issue_write", "add_issue_comment",
    "update_issue_comment", "pull_request_review_write", "add_comment_to_pending_review",
    "add_reply_to_pull_request_comment", "request_copilot_review", "assign_copilot_to_issue",
    "create_pull_request_with_copilot", "run_secret_scanning", "get_copilot_job_status",
    "get_me", "get_teams", "get_team_members", "search_users", "list_repository_collaborators",
    "ui_get", "list_issue_fields", "get_future_mutation", "search_future_mutation",
  ].map(name => "mcp__github__" + name),
];

// A deterministic fixture provider drives real Pi tool calls without an LLM,
// network request, or credential. It is loaded into real child sessions too.
writeFileSync(path.join(agentDir, "extensions", "poc-probe.ts"), `
import { AssistantMessageEventStream, getCurrentSystemPrompt } from "@earendil-works/pi-ai";
import { Type } from "typebox";
export default function (pi) {
  const shared = globalThis[Symbol.for("sandbox.poc.probes")];
  pi.registerProvider("poc", {
    api: "poc-api", apiKey: "unused", baseUrl: "https://invalid.example",
    models: [{ id: "test", name: "Test fixture", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 64000, maxTokens: 1024 }],
    streamSimple(model, context) {
      const stream = new AssistantMessageEventStream();
      const latestUser = [...context.messages].reverse().find(m => m.role === "user");
      const task = JSON.stringify(latestUser?.content ?? "");
      const last = context.messages.at(-1);
      if (last?.role === "toolResult" && last.isError) shared.failures.push(JSON.stringify(last));
      const researchCode = task.includes("POC_RESEARCH_READ") ? 'return await tools.mcp__github__get_file_contents({});'
        : task.includes("POC_RESEARCH_WRITE") ? 'return await tools.mcp__github__issue_write({});'
        : task.includes("POC_READ_OUTSIDE") ? 'return await tools.read({path:"../outside"});' : undefined;
      const tool = last?.role !== "toolResult" && researchCode ? { type: "toolCall", id: "research-poc", name: "codemode", arguments: { code: researchCode } }
        : last?.role !== "toolResult" && task.includes("POC_EDIT") ? { type: "toolCall", id: "edit-poc", name: "edit", arguments: { path: "file.txt", edits: [{ oldText: task.includes("POC_EDIT2") ? "primary edited" : "before", newText: "child edited" }] } }
        : last?.role !== "toolResult" && task.includes("POC_ASK") ? { type: "toolCall", id: "ask-poc", name: "poc_ask", arguments: {} } : undefined;
      const message = { role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(), stopReason: tool ? "toolUse" : "stop", content: tool ? [tool] : [{ type: "text", text: "POC_DONE" }], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      shared.models.push({ prompt: getCurrentSystemPrompt(context.messages), tools: context.messages.filter(m => m.role === "system").flatMap(m => m.tools ?? []).map(t => t.name) });
      queueMicrotask(() => {
        stream.push({ type: "start", partial: message });
        if (tool) { stream.push({ type: "toolcall_start", contentIndex: 0, partial: message }); stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: tool, partial: message }); }
        stream.push({ type: "done", reason: message.stopReason, message }); stream.end();
      });
      return stream;
    }
  });
  // Native MCP names are separate tool surfaces in the pinned permission package;
  // allowing a whole server or a get_* prefix would also admit future tools.
  for (const name of ${JSON.stringify([...researchAllowed, ...researchDenied])}) {
    pi.registerTool({ name, label: name, description: "Offline research permission fixture", exposure: name.startsWith("mcp__") ? "codemode" : "direct", parameters: Type.Object({}), execute: async () => ({ content: [{ type: "text", text: "RESEARCH_FIXTURE_OK" }], details: undefined }) });
  }
  pi.registerTool({ name: "poc_ask", label: "poc_ask", description: "Fixture requiring approval", parameters: Type.Object({}), execute: async () => { shared.asksExecuted++; return { content: [{ type: "text", text: "approved" }], details: undefined }; } });
  pi.on("session_start", (_event, ctx) => shared.contexts.set(ctx.sessionManager.getSessionId(), ctx));
  pi.events.on("permissions:ui_prompt", event => shared.prompts.push(event));
}
`);
const shared = { contexts: new Map(), prompts: [], models: [], failures: [], asksExecuted: 0 };
globalThis[Symbol.for("sandbox.poc.probes")] = shared;
const sdk = await import(pathToFileURL(process.env.POC_SDK_ENTRY ?? realpathSync(path.join(modules, "@earendil-works/pi-coding-agent/dist/index.js"))).href);
let session;
try {
  const settings = sdk.SettingsManager.create(cwd, agentDir, { projectTrusted: false });
  const loader = new sdk.DefaultResourceLoader({ cwd, agentDir, settingsManager: settings, noSkills: true, noContextFiles: true, extensionFactories: [sdk.createCodemodeExtension()] });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, [], "Every extension must load on Pi 0.99.2");
  const runtime = await sdk.ModelRuntime.create({ authPath: path.join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false });
  ({ session } = await sdk.createAgentSession({ cwd, agentDir, resourceLoader: loader, settingsManager: settings, modelRuntime: runtime, model: { id: "test", name: "Fixture", api: "poc-api", provider: "poc", input: ["text"], reasoning: false, baseUrl: "https://invalid.example", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 64000, maxTokens: 1024 }, sessionManager: sdk.SessionManager.inMemory(cwd) }));
  const errors = [];
  const ui = new Proxy({ select: async (_title, items) => items.find(item => /allow once|approve once/i.test(item)) ?? items[0], notify: () => {}, setStatus: () => {}, setWidget: () => {}, onTerminalInput: () => () => {} }, { get: (target, key) => target[key] ?? (() => {}) });
  await session.bindExtensions({ mode: "rpc", onError: error => errors.push(error), uiContext: ui });
  assert.deepEqual(errors, [], "Binding must not silently drop a security extension");
  const runner = session.extensionRunner;
  const preflight = () => session.prompt("POC_PRIME: return a fixture completion without tools");
  const gate = (name, input) => runner.emitToolCall({ type: "tool_call", toolName: name, toolCallId: "gate-poc", input });
  const execute = (name, input) => runner.createToolContext("nested-poc", new AbortController().signal).executeTool(name, input);
  runner.setUIContext(undefined, "json");
  await session.prompt("/agent planner");
  runner.setUIContext(ui, "rpc");
  await preflight();
  assert.notEqual((await gate("read", { path: "file.txt" }))?.block, true);
  assert.equal((await gate("edit", { path: "file.txt", edits: [{ oldText: "before", newText: "forbidden" }] })).block, true);
  assert.equal((await gate("bash", { command: "pwd" })).block, true);
  assert.match(JSON.stringify(await execute("read", { path: "file.txt" })), /before/);
  for (const role of ["planner", "orchestrator"]) {
    runner.setUIContext(undefined, "json");
    await session.prompt("/agent " + role);
    runner.setUIContext(ui, "rpc");
    await preflight();
    for (const name of researchAllowed) {
      assert.notEqual((await gate(name, {}))?.block, true, role + " must allow " + name);
      assert.ok(session.getCallableToolNames().includes(name), role + " must make callable " + name);
      if (!name.startsWith("mcp__")) assert.ok(session.getActiveToolNames().includes(name), role + " must expose " + name);
    }
    for (const name of researchDenied) {
      assert.equal((await gate(name, {})).block, true, role + " must deny " + name);
    }
    for (const name of ["edit", "write", "bash"]) {
      assert.equal((await gate(name, {})).block, true, role + " remains read-only");
    }
    assert.equal((await gate("read", { path: path.join(fixture, "outside") })).block, true);
    await session.prompt("POC_RESEARCH_READ");
    assert.match(JSON.stringify(session.agent.state.messages.at(-2)), /RESEARCH_FIXTURE_OK/);
    await session.prompt("POC_RESEARCH_WRITE");
    const deniedMutation = session.agent.state.messages.at(-2);
    assert.equal(deniedMutation.role, "toolResult");
    assert.equal(deniedMutation.isError, true, "Nested MCP mutation must be denied");
    assert.match(JSON.stringify(deniedMutation), /not permitted|blocked|denied/i);
  }
  assert.notEqual((await gate("subagent", { subagent_type: "worker", prompt: "POC_EDIT", description: "Child edit" }))?.block, true);
  const delegated = await execute("subagent", { subagent_type: "worker", prompt: "POC_EDIT", description: "Child edit" });
  assert.equal(readFileSync(path.join(cwd, "file.txt"), "utf8"), "child edited", JSON.stringify({ delegated, failures: shared.failures }));
  assert.ok(shared.models.some(call => call.prompt.includes('active_agent name="worker"')));
  const childPrompt = shared.models.find(call => call.prompt.includes('active_agent name="worker"')).prompt;
  assert.ok(!childPrompt.includes('active_agent name="planner"'), "Child identity cannot inherit the parent tag");
  const beforePrompts = shared.prompts.length;
  const asked = await execute("subagent", { subagent_type: "worker", prompt: "POC_ASK", description: "Child approval" });
  assert.equal(shared.asksExecuted, 1, JSON.stringify(asked));
  assert.ok(shared.prompts.length > beforePrompts, "Worker ASK must reach the parent's UI even though Planner denies unknown tools");
  runner.setUIContext(undefined, "json");
  await session.prompt("/agent worker");
  runner.setUIContext(ui, "rpc");
  await preflight();
  assert.notEqual((await gate("edit", { path: "file.txt", edits: [{ oldText: "child edited", newText: "primary edited" }] }))?.block, true);
  await execute("edit", { path: "file.txt", edits: [{ oldText: "child edited", newText: "primary edited" }] });
  assert.equal(readFileSync(path.join(cwd, "file.txt"), "utf8"), "primary edited");
  assert.equal((await gate("read", { path: path.join(fixture, "outside") })).block, true);
  assert.equal((await gate("write", { path: path.join(fixture, "outside"), content: "no" })).block, true);
  // Codemode nested calls must pass through the same permission and ceiling gates.
  await session.prompt("POC_READ_OUTSIDE");
  const nestedDenied = session.agent.state.messages.at(-2);
  assert.equal(nestedDenied.isError, true, JSON.stringify(nestedDenied));
  assert.match(JSON.stringify(nestedDenied), /outside|blocked|Path/);
  runner.setUIContext(undefined, "json");
  assert.equal((await gate("poc_ask", {})).block, true, "ASK without an approval route must fail closed");
  await session.prompt('/sandbox-narrow {"read":["${cwd}"],"write":[]}');
  assert.equal((await gate("write", { path: "narrowed.txt", content: "no" })).block, true);
  runner.setUIContext(undefined, "json");
  await session.prompt("/agent planner"); await preflight();
  runner.setUIContext(ui, "rpc");
  const independentlyScoped = await execute("subagent", { subagent_type: "worker", prompt: "POC_EDIT2", description: "Independent child scope" });
  assert.equal(readFileSync(path.join(cwd, "file.txt"), "utf8"), "child edited", JSON.stringify(independentlyScoped));
  assert.deepEqual(errors, [], JSON.stringify(errors));
  console.log("PASS: Planner/orchestrator research allowlist, denied GitHub mutations/unknown tools/proxies, nested MCP gate, actual primary identity/permission switch, Planner read/deny/delegate, actual stronger child edit, child ASK forwarded to RPC UI, no-UI ASK denied, outside paths denied, codemode gate, invocation narrowing");
} finally {
  if (session) { await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }); session.dispose(); }
  process.chdir(originalCwd);
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  delete globalThis[Symbol.for("sandbox.poc.probes")];
  rmSync(fixture, { recursive: true, force: true });
}
