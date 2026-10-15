import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = process.env.EASYEDA_TEST_SKILL;
const info = JSON.parse(await readFile(`${root}/build-info.json`, 'utf8'));
assert.equal(info.distribution, 'bundled');
assert.equal(info.platform, `${process.platform}-${process.arch}`);
assert.deepEqual(info.installationBlockers, []);
const require = createRequire(`${root}/scripts/runtime/package.json`);
const sharp = require('sharp');
const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer();
assert.equal(png.subarray(1, 4).toString(), 'PNG');
require(`${root}/scripts/runtime/node_modules/eda-copilot-backend/native/pcb-board-packer/index.cjs`);
const router = await import(pathToFileURL(`${root}/scripts/runtime/node_modules/eda-copilot-router/package-dist/index.js`));
const runtime = await router.prepareKrtRuntime();
assert.equal(runtime.directory, process.env.COPILOT_ROUTER_KRT_DIR);
assert.equal(runtime.pythonPath, process.env.COPILOT_ROUTER_PYTHON);
assert.equal(runtime.source, 'override');
// A broken supplied runtime must fail offline, never install a replacement.
const overridden = await router.prepareKrtRuntime({ assets: { allowDownload: true }, krtDirectory: '/nonexistent' });
assert.equal(overridden.directory, process.env.COPILOT_ROUTER_KRT_DIR);
const saved = process.env.COPILOT_ROUTER_KRT_DIR;
try {
  process.env.COPILOT_ROUTER_KRT_DIR = '/nonexistent';
  await assert.rejects(router.prepareKrtRuntime(), /override/);
} finally { process.env.COPILOT_ROUTER_KRT_DIR = saved; }
console.log('Bundled skill, PNG, native backend, offline KRT and invalid-runtime guard: OK');
