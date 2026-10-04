import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyTargets, parseMaintenance } from "../maintenance.ts";

const extensionDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const originalHome = homedir(), originalCwd = process.cwd();
const previous = { HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
const fixture = mkdtempSync(path.join(tmpdir(), "pi-configurator-test-"));
const home = path.join(fixture, "home"), agentDir = path.join(home, ".pi/agent"), cwd = path.join(fixture, "repo");
const sourceDir = path.join(home, ".local/share/chezmoi"), sourceAgentDir = path.join(sourceDir, "dot_pi/agent");
const modules = process.env.POC_MODULES;
assert.ok(modules, "Set POC_MODULES");
const sourceAgents = process.env.POC_AGENT_DEFINITIONS ?? path.resolve(extensionDir, "../../agents");
for (const dir of [cwd, sourceAgentDir, path.join(agentDir, "agents"), path.join(agentDir, "extensions/pi-permission-system")]) mkdirSync(dir, { recursive: true });
mkdirSync(path.join(home, ".local/share/pnpm/store/v11/links/@earendil-works"), { recursive: true });
const executable = path.join(originalHome, ".nix-profile/bin/chezmoi");
const config = parseMaintenance({ sourceDir, executable }, cwd, agentDir);
for (const target of ["auth.json", "sessions", "npm", "../settings.json", "/etc/passwd", "agents/../auth.json", ""]) {
  assert.throws(() => applyTargets([target], config));
}
assert.throws(() => applyTargets([], config));
process.env.HOME = home;
process.env.PI_CODING_AGENT_DIR = agentDir;
process.chdir(cwd);
const packages = ["pi-agent-router", "@gotgenes/pi-subagents", "@gotgenes/pi-permission-system"].map(name => path.join(modules, name));
const settingsJson = { packages, defaultProjectTrust: "never", compaction: { enabled: false }, retry: { enabled: false } };
writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify(settingsJson));
writeFileSync(path.join(agentDir, "subagents.json"), JSON.stringify({ excludedExtensionPackages: [packages[0]], defaultMaxTurns: 8 }));
for (const role of ["planner", "worker", "orchestrator"]) cpSync(path.join(sourceAgents, role + ".md"), path.join(agentDir, "agents", role + ".md"));
const templateFile = path.join(sourceAgents, "pi-configurator.md.tmpl");
const adminTemplate = readFileSync(existsSync(templateFile) ? templateFile : path.join(sourceAgents, "pi-configurator.md"), "utf8")
  .replaceAll("{{ .chezmoi.sourceDir }}", sourceDir)
  .replaceAll("{{ .chezmoi.homeDir }}", home).replaceAll(originalHome, home);
writeFileSync(path.join(agentDir, "agents/pi-configurator.md"), adminTemplate);
writeFileSync(path.join(agentDir, "agents/settings-editor.md"), adminTemplate.replace("name: pi-configurator", "name: settings-editor").replace("mode: primary", "mode: all"));
cpSync(extensionDir, path.join(agentDir, "extensions/sandbox-ceiling"), { recursive: true });
cpSync(path.resolve(sourceAgents, "../extensions/pi-permission-system/config.json"), path.join(agentDir, "extensions/pi-permission-system/config.json"));
writeFileSync(path.join(agentDir, "sandbox-ceiling.json"), JSON.stringify({ version: 1, backend: "bubblewrap", executable: path.join(originalHome, ".nix-profile/bin/bwrap"), maintenance: { sourceDir, executable }, runtimeRead: ["/usr", "/bin", "/lib", "/lib64", "/nix/store", path.join(originalHome, ".nix-profile"), path.join(originalHome, ".local/share/pnpm/store"), modules, extensionDir].filter(existsSync), timeoutMs: 30000 }));
writeFileSync(path.join(agentDir, "auth.json"), '{"test":"do-not-mutate"}');
writeFileSync(path.join(sourceAgentDir, "settings.json"), JSON.stringify({ ...settingsJson, marker: "managed" }));
writeFileSync(path.join(sourceAgentDir, "run_after_attack.sh"), `#!/bin/sh\necho bad > ${agentDir}/script-ran\n`);
writeFileSync(path.join(agentDir, "extensions/probe.ts"), `
import { AssistantMessageEventStream } from "@earendil-works/pi-ai";
export default function(pi) {
  pi.registerProvider("poc", { api:"poc-api", apiKey:"unused", baseUrl:"https://invalid.example", models:[{id:"test",name:"Fixture",reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:64000,maxTokens:1024}],
    streamSimple(model,context) {
      const stream = new AssistantMessageEventStream();
      const task = JSON.stringify([...context.messages].reverse().find(m=>m.role==="user")?.content ?? "");
      const last = context.messages.at(-1);
      if(last?.role==="toolResult" && last.isError) globalThis[Symbol.for("maintenance.probe")].push(JSON.stringify(last));
      const tool = last?.role!=="toolResult" && task.includes("SOURCE_EDIT") ? {type:"toolCall",id:"admin-write",name:"write",arguments:{path:${JSON.stringify(path.join(sourceAgentDir, "forbidden.txt"))},content:"bad"}} : last?.role!=="toolResult" && task.includes("CONFIG_APPLY") ? {type:"toolCall",id:"child-apply",name:"pi_config_apply",arguments:{targets:["settings.json"],dryRun:true}} : undefined;
      const message={role:"assistant",api:model.api,provider:model.provider,model:model.id,timestamp:Date.now(),stopReason:tool?"toolUse":"stop",content:tool?[tool]:[{type:"text",text:"DONE"}],usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
      queueMicrotask(()=>{stream.push({type:"start",partial:message});if(tool){stream.push({type:"toolcall_start",contentIndex:0,partial:message});stream.push({type:"toolcall_end",contentIndex:0,toolCall:tool,partial:message});}stream.push({type:"done",reason:message.stopReason,message});stream.end();});return stream;
    }
  });
}
`);
globalThis[Symbol.for("maintenance.probe")] = [];
const sdk = await import(pathToFileURL(process.env.POC_SDK_ENTRY ?? realpathSync(path.join(modules, "@earendil-works/pi-coding-agent/dist/index.js"))).href);
const errors = [];
const ui = new Proxy({ select: async (_title, items) => items.find(item => /allow once|approve once/i.test(item)) ?? items[0], notify: (message) => { if (process.env.POC_DEBUG) console.error(message); }, setStatus: () => {}, setWidget: () => {}, onTerminalInput: () => () => {} }, { get: (target, key) => target[key] ?? (() => {}) });
let session, runner, loader;
async function start(startCwd = cwd) {
  const settings = sdk.SettingsManager.create(startCwd, agentDir, { projectTrusted: false });
  loader = new sdk.DefaultResourceLoader({ cwd: startCwd, agentDir, settingsManager: settings, noSkills: true, noContextFiles: true });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const runtime = await sdk.ModelRuntime.create({ authPath: path.join(agentDir, "fixture-auth.json"), modelsPath: null, refreshOnCreate: false });
  ({ session } = await sdk.createAgentSession({ cwd: startCwd, agentDir, resourceLoader: loader, settingsManager: settings, modelRuntime: runtime, model: { id: "test", name: "Fixture", api: "poc-api", provider: "poc", input: ["text"], reasoning: false, baseUrl: "https://invalid.example", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 64000, maxTokens: 1024 }, sessionManager: sdk.SessionManager.inMemory(startCwd) }));
  await session.bindExtensions({ mode: "rpc", onError: error => errors.push(error), uiContext: ui });
  runner = session.extensionRunner;
}
async function stop() { if(session) { await runner.emit({ type: "session_shutdown", reason: "quit" }); session.dispose(); session = undefined; } }
async function select(name) { runner.setUIContext(undefined, "json"); await session.prompt("/agent " + name); runner.setUIContext(ui, "rpc"); await session.prompt("PRIME"); }
const gate = (toolName, input) => runner.emitToolCall({ type: "tool_call", toolName, toolCallId: "test", input });
const execute = (name, input) => runner.createToolContext("test", new AbortController().signal).executeTool(name, input);
try {
  await start(); await select("worker");
  assert.equal((await gate("read", { path: sourceAgentDir })).block, true, "Normal worker scope stays cwd-only");
  await select("settings-editor");
  if (process.env.POC_DEBUG) await session.prompt("/sandbox-status");
  const sourceFile = path.join(sourceAgentDir, "note.md");
  const sourceGate = await gate("write", { path: sourceFile, content: "source" });
  assert.notEqual(sourceGate?.block, true, JSON.stringify(sourceGate));
  assert.equal((await execute("write", { path: sourceFile, content: "source" })).isError, false);
  assert.equal((await gate("write", { path: path.join(agentDir, "settings.json"), content: "bad" })).block, true);
  const escaped = await execute("bash", { command: `printf bad > '${agentDir}/settings.json'` });
  assert.equal(escaped.isError, true, "Even approved bash cannot overwrite global targets");
  assert.equal(JSON.parse(readFileSync(path.join(agentDir, "settings.json"))).marker, undefined);
  const projectFile = path.join(cwd, ".pi/settings.json");
  assert.equal((await execute("write", { path: projectFile, content: '{"project":true}' })).isError, false);
  assert.equal(JSON.parse(readFileSync(projectFile)).project, true);
  assert.equal((await gate("pi_config_apply", { targets: ["auth.json"] })).block, true);
  runner.setUIContext(undefined, "json");
  assert.equal((await gate("pi_config_apply", { targets: ["settings.json"], overwrite: true })).block, true, "ASK without UI denies");
  runner.setUIContext(ui, "rpc");
  const preview = await execute("pi_config_apply", { targets: ["settings.json"], dryRun: true, overwrite: true });
  assert.equal(preview.isError, false, JSON.stringify(preview));
  assert.equal(JSON.parse(readFileSync(path.join(agentDir, "settings.json"))).marker, undefined);
  const applied = await execute("pi_config_apply", { targets: ["settings.json"], overwrite: true });
  assert.equal(applied.isError, false, JSON.stringify(applied));
  assert.equal(JSON.parse(readFileSync(path.join(agentDir, "settings.json"))).marker, "managed");
  assert.equal(readFileSync(path.join(agentDir, "auth.json"), "utf8"), '{"test":"do-not-mutate"}');
  assert.equal(existsSync(path.join(agentDir, "script-ran")), false);
  mkdirSync(path.join(cwd, ".pi/agents"));
  writeFileSync(path.join(cwd, ".pi/agents/pi-configurator.md"), adminTemplate);
  await select("pi-configurator");
  assert.notEqual((await gate("read", { path: sourceFile }))?.block, true, "Definitions created after startup do not alter the policy snapshot");
  rmSync(path.join(cwd, ".pi/agents/pi-configurator.md"));
  await select("planner");
  await execute("subagent", { subagent_type: "settings-editor", prompt: "CONFIG_APPLY", description: "Child apply must be denied" });
  assert.ok(globalThis[Symbol.for("maintenance.probe")].some(result => result.includes("primary session")), "A capability does not authorize child global apply");
  await select("pi-configurator");
  await session.prompt('/sandbox-narrow {"read":["${cwd}"],"write":[]}');
  assert.equal((await gate("pi_config_apply", { targets: ["settings.json"] })).block, true);
  await stop();
  writeFileSync(path.join(agentDir, "agents/pi-configurator.md"), adminTemplate);
  await start(home); await select("pi-configurator");
  assert.notEqual((await gate("write", { path: path.join(home, "unrelated.txt"), content: "allowed" }))?.block, true, "An explicit user-managed cwd grant is honored even from home");
  assert.notEqual((await gate("write", { path: sourceFile, content: "allowed" }))?.block, true);
  assert.equal((await execute("bash", { command: `mv '${home}/.pi' '${home}/renamed'` })).isError, true, "Cannot rename an ancestor of global configuration");
  assert.ok(existsSync(agentDir));
  assert.deepEqual(errors, []);
  console.log("PASS: name-independent global capability, ordinary worker isolation, source editing, global direct-write denial including bash, project settings creation, apply ASK/no-UI/dry-run, selected real chezmoi apply, protected credentials, no scripts, startup snapshot, child apply denial, invocation narrowing, declared home scope and ancestor-rename protection");
} finally {
  await stop(); process.chdir(originalCwd);
  for (const [key, value] of Object.entries(previous)) { if(value === undefined) delete process.env[key]; else process.env[key] = value; }
  delete globalThis[Symbol.for("maintenance.probe")];
  rmSync(fixture, { recursive: true, force: true });
}
