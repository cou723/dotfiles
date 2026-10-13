import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.SUBAGENTS_ROOT;
const host = path.join(process.env.PI_PACKAGE_DIR, 'node_modules/@earendil-works/pi-coding-agent');
const load = p => import(pathToFileURL(p));
const { convertAgent, discoverClaudeAgents } = await load(path.join(root, 'extensions/subagent/compat.mjs'));
const text = (fields, prompt = 'Read and report only.') => `---\nname: audit\ndescription: Audit code\n${fields}\n---\n${prompt}\n`;
const converted = convertAgent(text('tools: [Read, Grep, Glob, Bash]\ndisallowedTools: Bash\nmodel: inherit\nbackground: true'));
assert.deepEqual(converted.definition.tools, ['read', 'grep', 'find']);
assert.equal(converted.definition.defaultContext, 'fresh');
assert.equal(converted.definition.allowNestedSubagents, false);
assert.equal(converted.definition.defaultAsync, true);
assert.equal(converted.definition.model, undefined);
assert.deepEqual(convertAgent(text('tools: []')).definition.tools, []);
assert.deepEqual(convertAgent(text('permissionMode: plan')).definition.tools, ['read', 'grep', 'find', 'ls']);
for (const fields of ['hooks: {}', 'maxTurns: 3', 'memory: user', 'skills: [a]', 'isolation: worktree', 'permissionMode: bypassPermissions', 'tools: WebFetch', 'tools: Bash(git *)', 'model: sonnet', 'tools: 12', 'background: maybe']) {
  assert.throws(() => convertAgent(text(fields)), undefined, fields);
}
const base = fs.mkdtempSync(path.join(process.env.HOME, 'compat-'));
const home = path.join(base, 'home'); const repo = path.join(base, 'repo');
fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
fs.mkdirSync(path.join(repo, 'nested'), { recursive: true });
for (const dir of [path.join(home,'.claude/agents'), path.join(repo,'.claude/agents'), path.join(base,'.claude/agents')]) fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(home,'.claude/agents/a.md'), text('', 'User agent.'));
fs.writeFileSync(path.join(repo,'.claude/agents/a.md'), text('', 'Project agent.'));
fs.writeFileSync(path.join(base,'.claude/agents/parent.md'), text('name: leak'));
assert.equal(discoverClaudeAgents(path.join(repo,'nested'), false, home).agents[0].definition.systemPrompt,'User agent.');
assert.equal(discoverClaudeAgents(path.join(repo,'nested'), true, home).agents[0].definition.systemPrompt,'Project agent.');
fs.writeFileSync(path.join(repo,'.claude/agents/a.md'), text('hooks: {}'));
const rejected = discoverClaudeAgents(repo,true,home);
assert.equal(rejected.agents.length,1); assert.ok(rejected.agents[0].error); assert.equal(rejected.errors.length,1);

const { loadExtensions } = await load(path.join(host,'dist/core/extensions/loader.js'));
const deployed = path.join(process.env.HOME,'.pi/agent/extensions/subagent');
fs.mkdirSync(path.dirname(deployed), {recursive:true});
fs.symlinkSync(path.join(root,'extensions/subagent'),deployed);
const loaded = await loadExtensions([path.join(deployed,'index.ts')], repo);
try {
  assert.deepEqual(loaded.errors, []);
  const ext = loaded.extensions[0];
  for (const tool of ['subagent','bg_wait']) assert.ok(ext.tools.has(tool),tool);
  for (const command of ['subagents','subagents-doctor','claude-agents']) assert.ok(ext.commands.has(command),command);
  const required = await load(path.join(root,'node_modules/pi-subagents/src/shared/required-child-extensions.js'));
  const id = 'test-subagent-session';
  // Exercise the actual adapter lifecycle; upstream lifecycle is checked below through SDK.
  const ctx = { cwd: repo, isProjectTrusted: () => false, sessionManager: { getSessionId: () => id }, ui: { notify() {} } };
  await ext.handlers.get('session_start')[0]({}, ctx);
  const snapshot = required.resolveRequiredChildExtensions(id);
  assert.equal(snapshot.length, 2);
  assert.ok(snapshot.every(x => x.requireForAllRunners && fs.existsSync(x.path)));
  assert.throws(() => required.assertRequiredChildExtensionsAdmitted([snapshot], {agent:'external',runnerType:'external-cli'}));
  assert.throws(() => required.assertRequiredChildExtensionsAdmitted([snapshot], {agent:'remote',machine:'remote'}));
  for(const handler of ext.handlers.get('session_shutdown')) {
    // Only our first registered cleanup is safe without an initialized upstream runtime.
    await handler({},ctx); break;
  }
  assert.equal(required.resolveRequiredChildExtensions(id).length,0);
} finally { loaded.runtime.invalidate(); }

// Run the real SDK lifecycle, with no prompt, auth or network calls.
const sdk = await load(path.join(host,'dist/index.js'));
const settings = sdk.SettingsManager.inMemory({ subagents: { toolActivation:'eager' } });
const resources = new sdk.DefaultResourceLoader({
  cwd: repo, agentDir: path.join(process.env.HOME,'.pi/agent'), settingsManager: settings,
  additionalExtensionPaths:[path.join(deployed,'index.ts'), process.env.MOCK_PROVIDER],
  noSkills:true, noPromptTemplates:true, noThemes:true,
});
const claudeDir = path.join(process.env.HOME,'.claude/agents');
fs.mkdirSync(claudeDir,{recursive:true});
fs.writeFileSync(path.join(claudeDir,'audit.md'), text('tools: Read\nmodel: subagent-test/test'));
fs.writeFileSync(path.join(claudeDir,'broken.md'), text('name: broken\nhooks: {}'));
await resources.reload();
assert.deepEqual(resources.getExtensions().errors,[]);
const {session} = await sdk.createAgentSession({cwd:repo, settingsManager:settings, resourceLoader:resources, sessionManager:sdk.SessionManager.inMemory(repo)});
try {
  await session.bindExtensions({});
  assert.ok(session.getActiveToolNames().includes('subagent'));
  await session.prompt('/claude-agents');
  // A real native child session, with deterministic in-memory model output.
  const agentsDir = path.join(process.env.HOME,'.pi/agent/agents');
  fs.mkdirSync(agentsDir,{recursive:true});
  fs.writeFileSync(path.join(agentsDir,'fresh-test.md'), `---\nname: fresh-test\ndescription: Deterministic child\ntools: read\nmodel: subagent-test/test\nsubagentOnlyExtensions: ${process.env.MOCK_PROVIDER}\ndefaultContext: fresh\n---\nReturn the deterministic test result.\n`);
  const testModel = session.extensionRunner.createContext().modelRegistry.find('subagent-test','test');
  assert.ok(testModel);
  await session.setModel(testModel);
  assert.equal(session.model?.provider, 'subagent-test');
  await session.prompt('PARENT_HISTORY_CANARY');
  const tool = session.agent.state.tools.find(t => t.name === 'subagent');
  const result = await tool.execute('child-test',{ agent:'fresh-test',task:'Check fresh context.',async:false,options:{context:'fresh',mission:false,acceptance:false} },new AbortController().signal);
  assert.ok(!result.isError, JSON.stringify(result));
  assert.ok(JSON.stringify(result.content).includes('FRESH_CHILD_OK'), JSON.stringify(result.content));
  const claudeResult = await tool.execute('claude-test',{agent:'claude-audit',task:'Check converted Claude agent.',async:false,options:{context:'fresh',mission:false,acceptance:false}},new AbortController().signal);
  assert.ok(JSON.stringify(claudeResult.content).includes('FRESH_CHILD_OK'));
  await assert.rejects(() => tool.execute('blocked-test',{agent:'claude-broken',task:'Must fail before model execution.',async:false,options:{mission:false,acceptance:false}},new AbortController().signal), /unsupported|unavailable/i);
} finally {
  const { emitSessionShutdownEvent } = await load(path.join(host, 'dist/core/extensions/runner.js'));
  await emitSessionShutdownEvent(session.extensionRunner, { type:'session_shutdown', reason:'exit' });
  session.dispose();
}
console.log('PASS: Pi loader + SDK lifecycle, Claude YAML tools/denylist/fresh/plan, unsupported fields rejected, trust + precedence, required permissions and external-runner rejection. Deterministic native child verified; no external API calls.');
