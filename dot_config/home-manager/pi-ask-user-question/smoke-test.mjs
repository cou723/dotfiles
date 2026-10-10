// Actual Pi loader + upstream execute paths, without credentials or model calls.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const host = join(process.env.PI_PACKAGE_DIR, 'node_modules/@earendil-works');
const loader = await import(pathToFileURL(join(host, 'pi-coding-agent/dist/core/extensions/loader.js')));
const loaded = await loader.loadExtensions([
  join(process.env.QUESTION_ROOT, 'extensions/50-ask-user-question.ts'),
], process.cwd());
try {
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const registered = loaded.extensions[0].tools.get('ask_user_question');
  assert.ok(registered);
  const tool = registered.definition;
  const options = [
    { label: 'A', description: 'First choice', preview: '```ts\nconst a = 1;\n```' },
    { label: 'B', description: 'Second choice' },
  ];
  const params = { questions: [
    { question: 'Which choice?', header: 'Single', options },
    { question: 'Which items?', header: 'Multi', multiSelect: true, options },
  ] };
  const rpc = { hasUI: true, mode: 'rpc', ui: {
    select: async (_title, items) => items[0],
    input: async () => '1,2',
  } };
  const result = await tool.execute('rpc-test', params, new AbortController().signal, undefined, rpc);
  assert.equal(result.details.cancelled, false);
  assert.equal(result.details.answers[0].answer, 'A');
  assert.deepEqual(result.details.answers[1].selected, ['A', 'B']);
  const cancelled = await tool.execute('cancel-test', params, undefined, undefined,
    { ...rpc, ui: { ...rpc.ui, select: async () => undefined } });
  assert.equal(cancelled.details.cancelled, true);

  // Exercise lazy TUI imports/render graph, not only tool registration or RPC.
  const { initTheme } = await import(pathToFileURL(join(host, 'pi-coding-agent/dist/modes/interactive/theme/theme.js')));
  initTheme('dark', false);
  let renders = 0;
  const tuiContext = { hasUI: true, mode: 'tui', ui: {
    custom: async (factory) => {
      const component = await factory(
        { requestRender() {}, terminal: { rows: 40, columns: 120 } },
        { fg: (_color, text) => text, bg: (_color, text) => text,
          bold: text => text, italic: text => text, strikethrough: text => text,
          getFgAnsi: () => '', getBgAnsi: () => '' },
        { matches: () => false, getKeys: () => [] },
        () => {},
      );
      for (const width of [60, 120]) {
        assert.ok(component.render(width).length > 0);
        renders++;
      }
      component.dispose?.();
      return { answers: [], cancelled: true };
    },
  } };
  const tuiResult = await tool.execute('tui-test', params, undefined, undefined, tuiContext);
  assert.equal(renders, 2, 'lazy TUI must render at narrow and wide widths');
  assert.equal(tuiResult.details.cancelled, true);
  console.log('PASS: Pi loader, tool registration, RPC single/multi answers, cancellation, lazy TUI render at 60/120 columns. No API calls.');
} finally {
  loaded.runtime.invalidate();
}
