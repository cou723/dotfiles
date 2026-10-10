// Explicit opt-in: one real model request through the production registered tool.
// Never print or persist credential contents. Offline tests are in smoke-test.mjs.
import assert from 'node:assert/strict';
import { readFile, access, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
if (process.env.RUN_LIVE_MODEL !== '1') throw new Error('Set RUN_LIVE_MODEL=1 to authorize one real provider request.');
const root = process.env.SUBAGENT_ROOT;
const host = process.env.PI_PACKAGE_DIR;
assert.ok(root && host, 'SUBAGENT_ROOT and PI_PACKAGE_DIR are required');
const agentDir = process.env.PI_CODING_AGENT_DIR ? resolve(process.env.PI_CODING_AGENT_DIR) : join(homedir(), '.pi/agent');
const settings = JSON.parse(await readFile(join(agentDir, 'settings.json'), 'utf8'));
const provider = settings.defaultProvider;
const id = settings.defaultModel;
assert.ok(provider && id, 'Set an explicit defaultProvider/defaultModel in the parent settings first.');
const loader = await import(pathToFileURL(join(host, 'node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js')));
const loaded = await loader.loadExtensions([join(root, 'extensions/60-defined-subagents.ts')], process.cwd());
let artifacts;
let succeeded = false;
try {
  assert.deepEqual(loaded.errors, []);
  const tool = loaded.extensions[0].tools.get('subagent').definition;
  const result = await tool.execute('live-smoke', {
    agent: 'researcher',
    task: 'This is a setup connectivity test. Do not use any tools. Reply with exactly: subagent smoke OK',
  }, undefined, undefined, { cwd: process.cwd(), model: { provider, id } });
  artifacts = result.details.artifacts;
  assert.equal(result.details.status, 'completed', `Provider test failed (${result.details.failureKind}); artifacts: ${artifacts}`);
  assert.match(result.content[0].text, /subagent smoke OK/);
  await assert.rejects(access(join(dirname(artifacts), 'work/.runtime')));
  succeeded = true;
  console.log(`PASS: production tool -> bubblewrap -> Pi -> ${provider}/${id} -> bounded summary; runtime credential copy removed. One model request, no child tools.`);
} finally {
  loaded.runtime.invalidate();
  if (succeeded && artifacts && !process.env.KEEP_LIVE_ARTIFACTS) await rm(dirname(artifacts), { recursive: true, force: true });
}
