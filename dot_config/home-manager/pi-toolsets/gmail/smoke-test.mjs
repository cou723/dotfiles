// Exercise the real Pi loader and credential validation without account/API calls.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const host = join(process.env.PI_PACKAGE_DIR, 'node_modules/@earendil-works/pi-coding-agent');
const { loadExtensions } = await import(pathToFileURL(join(host, 'dist/core/extensions/loader.js')));
const { getMcpToolExposure } = await import(pathToFileURL(join(host, 'dist/core/mcp-servers.js')));
const dir = mkdtempSync(join(tmpdir(), 'gmail-mcp-test-'));
const original = process.env.GMAIL_MCP_CLIENT_SECRET_PATH;
const load = async (filename) => {
  process.env.GMAIL_MCP_CLIENT_SECRET_PATH = join(dir, filename);
  const loaded = await loadExtensions([join(process.env.GMAIL_ROOT, 'extensions/85-gmail.ts')], process.cwd());
  assert.deepEqual(loaded.errors, []);
  const config = loaded.runtime.mcpServers.get('gmail')?.config;
  assert.ok(config);
  assert.equal(config.url, 'https://gmailmcp.googleapis.com/mcp/v1');
  assert.equal(config.command, undefined);
  assert.equal(config.oauth.callbackUrl, 'http://127.0.0.1:8766/callback');
  assert.equal(config.oauth.authServerMetadataUrl, 'https://accounts.google.com/.well-known/openid-configuration');
  assert.equal(config.oauth.scope, 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose');
  for (const tool of ['search_threads', 'get_thread', 'get_message', 'list_drafts', 'list_labels', 'create_draft']) {
    assert.equal(getMcpToolExposure(config, tool), 'codemode');
  }
  for (const tool of ['send_message', 'send_draft', 'send_gmail_message', 'label_message', 'label_thread', 'unlabel_message', 'unlabel_thread', 'delete_message', 'future_tool']) {
    assert.equal(getMcpToolExposure(config, tool), 'hidden');
  }
  return { loaded, config };
};
try {
  for (const [filename, contents] of [
    ['missing.json', undefined],
    ['broken.json', '{"secret":"FAKE-SECRET",'],
    ['desktop.json', JSON.stringify({ installed: { client_id: 'fake-id', client_secret: 'FAKE-SECRET' } })],
    ['wrong-callback.json', JSON.stringify({ web: { client_id: 'fake-id', client_secret: 'FAKE-SECRET', redirect_uris: ['https://example.invalid/callback'] } })],
    ['empty.json', JSON.stringify({ web: { client_id: ' ', client_secret: 'FAKE-SECRET', redirect_uris: ['http://127.0.0.1:8766/callback'] } })],
  ]) {
    if (contents !== undefined) writeFileSync(join(dir, filename), contents, { mode: 0o600 });
    const { loaded, config } = await load(filename);
    assert.equal(config.enabled, false);
    assert.equal(config.oauth.clientId, undefined);
    assert.equal(config.oauth.clientSecret, undefined);
    const handlers = loaded.extensions[0].handlers.get('session_start');
    assert.equal(handlers.length, 1);
    let notices = 0;
    await handlers[0]({}, { hasUI: true, ui: { notify: (message) => {
      notices++;
      assert.ok(!message.includes('FAKE-SECRET'));
      assert.ok(message.includes('/reload'));
    } } });
    await handlers[0]({}, { hasUI: false });
    assert.equal(notices, 1);
  }
  writeFileSync(join(dir, 'valid.json'), JSON.stringify({ web: {
    client_id: 'fake-id', client_secret: 'FAKE-SECRET',
    redirect_uris: ['http://127.0.0.1:8766/callback'],
  } }), { mode: 0o600 });
  const { config } = await load('valid.json');
  assert.equal(config.enabled, true);
  assert.equal(config.oauth.clientId, 'fake-id');
  assert.equal(config.oauth.clientSecret, 'FAKE-SECRET');
  console.log('Official Gmail MCP registration, credentials and hidden mutation tools: OK (no account/API calls)');
} finally {
  if (original === undefined) delete process.env.GMAIL_MCP_CLIENT_SECRET_PATH;
  else process.env.GMAIL_MCP_CLIENT_SECRET_PATH = original;
  rmSync(dir, { recursive: true, force: true });
}
