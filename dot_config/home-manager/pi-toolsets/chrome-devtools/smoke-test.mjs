// Run outside the Nix sandbox for the browser test; --registration-only is pure.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const host = join(process.env.PI_PACKAGE_DIR, 'node_modules/@earendil-works/pi-coding-agent');
const { loadExtensions } = await import(pathToFileURL(join(host, 'dist/core/extensions/loader.js')));
const loaded = await loadExtensions([
  join(process.env.CHROME_TOOLSET_ROOT, 'extensions/84-chrome-devtools-mcp.ts'),
], process.cwd());
assert.deepEqual(loaded.errors, []);
const config = loaded.runtime.mcpServers.get('chrome_devtools')?.config;
assert.ok(config);
assert.ok(config.command.startsWith('/nix/store/'));
assert.equal(config.exposure, 'codemode');
assert.equal(config.timeout, 120);
assert.equal(config.args[0], '--user-data-dir');
assert.ok(config.args[1].endsWith('/pi/chrome-devtools/profile'));
const wrapper = readFileSync(config.command, 'utf8');
for (const flag of ['--no-usage-statistics', '--no-performance-crux', '--redact-network-headers', '--no-file-navigations']) {
  assert.ok(wrapper.includes(flag), `Missing privacy flag ${flag}`);
}
for (const variable of ['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS', 'CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS', 'CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY']) {
  assert.ok(wrapper.includes(`export ${variable}=1`));
}
assert.ok(!wrapper.includes('--no-sandbox'));
assert.match(wrapper, /--executable-path=\/nix\/store\/.*\/bin\/google-chrome-stable/);
console.log('Pi extension loader, MCP registration and runtime privacy/sandbox flags: OK');
if (process.argv.includes('--registration-only')) process.exit(0);

const dir = mkdtempSync(join(tmpdir(), 'pi-chrome-smoke-'));
const http = createServer((req, res) => {
  if (req.url === '/api/failure') {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{"error":"intentional-smoke-failure"}');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><title>Pi Chrome smoke</title>
    <label>Name <input id="name"></label><button id="save">Save</button>
    <p id="result">Not saved</p>
    <script>
      console.error('intentional-smoke-console');
      fetch('/api/failure');
      document.querySelector('#save').onclick = () => {
        document.querySelector('#result').textContent =
          'Saved: ' + document.querySelector('#name').value;
      };
    </script>`);
});
http.listen(0, '127.0.0.1');
await once(http, 'listening');
const args = ['--user-data-dir', join(dir, 'profile')];
if (process.env.CHROME_SMOKE_HEADED !== '1') args.push('--headless');
const child = spawn(config.command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-12000); });
let nextId = 0;
const pending = new Map();
const lines = createInterface({ input: child.stdout });
lines.on('line', (line) => {
  const message = JSON.parse(line);
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  clearTimeout(handler.timer);
  if (message.error) handler.reject(new Error(JSON.stringify(message.error)));
  else handler.resolve(message.result);
});
child.on('exit', (code) => {
  for (const handler of pending.values()) {
    clearTimeout(handler.timer);
    handler.reject(new Error(`MCP exited ${code}: ${stderr}`));
  }
  pending.clear();
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => {
    pending.delete(id);
    reject(new Error(`${method} timed out: ${stderr}`));
  }, 90000);
  pending.set(id, { resolve, reject, timer });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const text = (result) => result.content?.filter((c) => c.type === 'text').map((c) => c.text).join('\n') || '';
try {
  await rpc('initialize', {
    protocolVersion: '2025-03-26', capabilities: {},
    clientInfo: { name: 'pi-chrome-smoke', version: '1.0.0' },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const { tools } = await rpc('tools/list', {});
  let pageId;
  const call = async (name, args = {}) => {
    const schema = tools.find((tool) => tool.name === name)?.inputSchema;
    assert.ok(schema, `Missing tool ${name}`);
    if (schema.properties?.pageId && pageId !== undefined) args = { pageId, ...args };
    const result = await rpc('tools/call', { name, arguments: args });
    assert.ok(!result.isError, `${name}: ${text(result)}\n${stderr}`);
    return result;
  };
  const pages = await call('new_page', { url: `http://127.0.0.1:${http.address().port}` });
  const pageMatch = text(pages).match(/(?:^|\n)(\d+): .*http:\/\/127\.0\.0\.1/);
  assert.ok(pageMatch, text(pages));
  pageId = Number(pageMatch[1]);
  const snapshot = text(await call('take_snapshot'));
  const input = snapshot.match(/uid=([\w_]+) textbox/);
  const button = snapshot.match(/uid=([\w_]+) button "Save"/);
  assert.ok(input && button, snapshot);
  await call('fill', { uid: input[1], value: 'smoke' });
  await call('click', { uid: button[1] });
  assert.match(text(await call('take_snapshot')), /Saved: smoke/);
  assert.match(text(await call('list_console_messages')), /intentional-smoke-console/);
  assert.match(text(await call('list_network_requests')), /api\/failure.*500/);
  const evaluation = text(await call('evaluate_script', { function: '() => document.title' }));
  assert.match(evaluation, /Pi Chrome smoke/);
  const shot = join(dir, 'screenshot.png');
  await call('take_screenshot', { filePath: shot });
  assert.ok(statSync(shot).size > 100);
  const trace = join(dir, 'trace.json.gz');
  await call('performance_start_trace', { reload: true, autoStop: true, filePath: trace });
  assert.ok(statSync(trace).size > 100);
  console.log(`MCP browser (${process.env.CHROME_SMOKE_HEADED === '1' ? 'headed' : 'headless'}): navigation, fill/click, snapshot, console, failed network request, JS, screenshot, performance trace OK`);
} finally {
  const exited = once(child, 'exit');
  child.stdin.end();
  const killTimer = setTimeout(() => child.kill('SIGTERM'), 7000);
  await exited;
  clearTimeout(killTimer);
  lines.close();
  http.closeAllConnections();
  await new Promise((resolve) => http.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
