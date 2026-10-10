// Build-time integration test only; no runtime adapters, API calls or credentials.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const root = await mkdtemp(join(tmpdir(), 'pi-conversation-history-'));
process.env.HOME = root;
process.env.PI_CODING_AGENT_DIR = join(root, 'agent');
const host = join(process.env.PI_PACKAGE_DIR, 'node_modules/@earendil-works');
let session;
let loaded;
try {
  const sdk = await import(pathToFileURL(join(host, 'pi-coding-agent/dist/index.js')));
  const { getModel } = await import(pathToFileURL(join(host, 'pi-ai/dist/compat.js')));
  const loader = await import(pathToFileURL(join(host, 'pi-coding-agent/dist/core/extensions/loader.js')));
  const cwd = join(root, 'workspace');
  await mkdir(cwd);
  const sentinel = join(cwd, 'existing.txt');
  await writeFile(sentinel, 'Current files must remain unchanged.\n');
  loaded = await loader.loadExtensions([
    join(process.env.HISTORY_ROOT, 'extensions/30-conversation-undo.ts'),
    join(process.env.HISTORY_ROOT, 'extensions/40-conversation-undo-tree.ts'),
  ], cwd);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 2);
  const undo = loaded.extensions[0].commands.get('undo');
  const tree = loaded.extensions[1].commands.get('undo-tree');
  assert.ok(undo && tree);
  // Neither extension registers tools or file/checkpoint lifecycle hooks.
  for (const extension of loaded.extensions) {
    assert.equal(extension.tools.size, 0);
    assert.equal(extension.handlers.size, 0);
  }
  const sm = sdk.SessionManager.inMemory(cwd);
  const userIds = [];
  const assistantIds = [];
  for (let i = 1; i <= 5; i++) {
    userIds.push(sm.appendMessage({ role: 'user', content: [{ type: 'text', text: `prompt ${i}` }], timestamp: Date.now() }));
    assistantIds.push(sm.appendMessage({ role: 'assistant', content: [{ type: 'text', text: `answer ${i}` }],
      api: 'openai-responses', provider: 'openai', model: 'gpt-5.5', stopReason: 'stop', timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }));
  }
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: join(root, 'auth.json'), modelsPath: join(root, 'models.json') });
  const emptyResources = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: loader.createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }), getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => '', getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [],
    extendResources() {}, async reload() {},
  };
  ({ session } = await sdk.createAgentSession({ cwd, agentDir: process.env.PI_CODING_AGENT_DIR,
    model: getModel('openai', 'gpt-5.5'), modelRuntime, sessionManager: sm,
    resourceLoader: emptyResources, tools: [], settingsManager: sdk.SettingsManager.inMemory({ compaction: { enabled: false } }) }));
  const originalLeaf = sm.getLeafId(); // SDK may append model/tool configuration entries.
  let editorText = '';
  let busy = false;
  let cancel = false;
  const notices = [];
  const ctx = {
    cwd, mode: 'tui', hasUI: true, sessionManager: sm,
    isIdle: () => !busy,
    navigateTree: async (id, options) => {
      assert.equal(options.summarize, false, 'normal navigation must not call a summarization model');
      if (cancel) return { cancelled: true };
      const result = await session.navigateTree(id, options);
      if (result.editorText !== undefined) editorText = result.editorText;
      return result;
    },
    ui: {
      notify: (message, level) => notices.push({ message, level }),
      setEditorText: text => { editorText = text; },
      custom: async () => { throw new Error('UI test not configured'); },
    },
  };
  await undo.handler('3', ctx);
  assert.equal(sm.getLeafId(), assistantIds[1], '/undo 3 retains the first two user turns');
  assert.equal(editorText, 'prompt 3');
  assert.equal(session.messages.filter(m => m.role === 'user').length, 2, 'real model context must rewind too');
  assert.ok(sm.getEntry(assistantIds[4]), 'abandoned conversation must be retained');
  assert.equal(sm.getEntries().filter(e => e.type === 'message').length, 10);
  for (const invalid of ['0', '-1', 'abc', '1.5']) {
    await undo.handler(invalid, ctx);
    assert.equal(sm.getLeafId(), assistantIds[1]);
  }
  busy = true;
  await undo.handler('', ctx);
  assert.equal(sm.getLeafId(), assistantIds[1]);
  busy = false;
  cancel = true;
  await undo.handler('', ctx);
  assert.equal(sm.getLeafId(), assistantIds[1]);
  cancel = false;

  // Exercise the actual upstream visualizer: render, move forward three turns,
  // and Enter to return to the abandoned branch without touching files.
  ctx.ui.custom = async factory => {
    let action;
    const component = factory({ requestRender() {} }, { fg: (_color, text) => text }, {}, value => { action = value; });
    for (const width of [60, 100]) assert.ok(component.render(width).length > 0);
    // Settings/transcript entries may form extra visual nodes; descend to the
    // end of the original branch rather than assuming exactly three UI nodes.
    for (let i = 0; i < 20; i++) component.handleInput('j');
    component.handleInput('\r');
    assert.ok(action, 'visualizer must produce a real navigation action');
    assert.equal(action.rawTargetId, originalLeaf);
    return action;
  };
  await tree.handler('', ctx);
  assert.equal(sm.getLeafId(), originalLeaf, 'visual redo returns to the former leaf');
  assert.equal(session.messages.filter(m => m.role === 'user').length, 5);

  // One-step/default, excessive steps, and branching after undo.
  await undo.handler('', ctx);
  assert.equal(sm.getLeafId(), assistantIds[3]);
  await undo.handler('999', ctx);
  assert.equal(sm.getBranch().filter(e => e.type === 'message' && e.message.role === 'user').length, 0);
  assert.match(notices.at(-1).message, /no more on this branch/);
  const replacement = sm.appendMessage({ role: 'user', content: [{ type: 'text', text: 'replacement prompt' }], timestamp: Date.now() });
  assert.ok(sm.getEntry(assistantIds[4]), 'new branch must not destroy redo destinations');
  assert.ok(sm.getEntry(replacement));
  assert.equal(await readFile(sentinel, 'utf8'), 'Current files must remain unchanged.\n');
  console.log('PASS: real Pi 1.1 SDK/loader, /undo N, context rewind, abandoned branch retention, visual redo, TUI rendering, invalid/busy/cancel handling and unchanged workspace. No API calls.');
} finally {
  session?.dispose();
  loaded?.runtime.invalidate();
  await rm(root, { recursive: true, force: true });
}
