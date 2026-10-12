// Real Pi loader + upstream API paths with mocked fetch. No external requests.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.CONTEXT7_ROOT;
const piDir = process.env.PI_PACKAGE_DIR;
const { loadExtensions } = await import(pathToFileURL(join(piDir,
  'node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js')));
const loaded = await loadExtensions([join(root, 'extensions/70-context7.ts')], process.cwd());
const originalFetch = globalThis.fetch;
const originalKey = process.env.CONTEXT7_API_KEY;
try {
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const tools = loaded.extensions[0].tools;
  assert.deepEqual([...tools.keys()].sort(), ['query-docs', 'resolve-library-id']);
  assert.ok(existsSync(join(root, 'skills/context7-docs/SKILL.md')));
  assert.ok(existsSync(join(root, 'prompts/c7-docs.md')));
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    if (new URL(url).pathname === '/api/v2/libs/search') {
      return new Response(JSON.stringify({ results: [{
        id: '/example/docs', title: 'Example', description: 'Test docs', trustScore: 9,
      }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Example documentation', { status: 200 });
  };
  delete process.env.CONTEXT7_API_KEY;
  const search = await tools.get('resolve-library-id').definition.execute('test-resolve',
    { query: 'example setup', libraryName: 'Example' });
  assert.ok(search.content[0].text.includes('/example/docs'));
  assert.equal(calls[0].url.origin, 'https://context7.com');
  assert.equal(calls[0].url.searchParams.get('query'), 'example setup');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  process.env.CONTEXT7_API_KEY = 'ctx7sk_test_fixture';
  const docs = await tools.get('query-docs').definition.execute('test-query',
    { query: 'configuration', libraryId: '/example/docs' });
  assert.equal(docs.content[0].text, 'Example documentation');
  assert.equal(calls[1].url.searchParams.get('libraryId'), '/example/docs');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer ctx7sk_test_fixture');
  globalThis.fetch = async () => new Response('{}', { status: 429 });
  const limited = await tools.get('resolve-library-id').definition.execute('test-limit',
    { query: 'test', libraryName: 'Example' });
  assert.match(limited.content[0].text, /[Rr]ate limited/);

  // Exercise the actual permission-system resolver, not just JSON key presence.
  const { createJiti } = await import(pathToFileURL(join(piDir, 'node_modules/jiti/lib/jiti.mjs')));
  const systemRoot = join(process.env.REVIEW_ROOT, 'node_modules/@gotgenes/pi-permission-system');
  const jiti = createJiti(join(systemRoot, 'package.json'), { moduleCache: false });
  const { PermissionManager } = await jiti.import(join(systemRoot, 'src/policy/permission-manager.ts'));
  const manager = new PermissionManager({
    globalConfigPath: process.env.POLICY_CONFIG,
    agentsDir: join(process.env.HOME, 'missing-agents'),
  });
  for (const name of ['ask_user_question', 'resolve-library-id', 'query-docs']) {
    assert.equal(manager.check({ kind: 'tool', surface: name, input: { query: 'test' } }).state, 'allow');
  }
  for (const name of ['bash', 'write', 'edit', 'read', 'unknown-tool', 'mcp__other__query_docs']) {
    assert.equal(manager.getToolPermission(name), 'ask', `${name} must still require review`);
  }
  assert.deepEqual(manager.getConfigIssues(), []);
  console.log('PASS: real Pi loader, Context7 search/docs, optional auth, rate-limit handling, skill/prompt, actual permission resolver (three exact allows; other tools ask). No API calls.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.CONTEXT7_API_KEY;
  else process.env.CONTEXT7_API_KEY = originalKey;
  loaded.runtime.invalidate();
}
