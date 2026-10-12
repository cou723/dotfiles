import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { loadExtensions } = await import(pathToFileURL(join(process.env.PI_PACKAGE_DIR,
  'node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js')));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network forbidden in registration check'); };
let loaded;
try {
  loaded = await loadExtensions([join(process.env.TODOIST_MCP_ROOT, 'extensions/80-todoist-mcp.ts')], process.cwd());
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const servers = loaded.runtime.mcpServers.list();
  assert.equal(servers.length, 1);
  const server = servers[0];
  assert.equal(server.name, 'todoist');
  assert.equal(server.config.url, 'https://ai.todoist.net/mcp');
  assert.equal(server.config.exposure, 'codemode');
  assert.equal(server.config.headers, undefined);
  assert.equal(server.config.command, undefined);
  assert.equal(server.config.oauth?.clientSecret, undefined);
  assert.equal(loaded.extensions[0].tools.size, 0);
  assert.equal(loaded.extensions[0].commands.size, 0);
  console.log('Todoist: real Pi loader registers native HTTP MCP; no adapter, secret or network call.');
} finally {
  loaded?.runtime.invalidate();
  globalThis.fetch = originalFetch;
}
