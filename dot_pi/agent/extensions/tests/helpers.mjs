import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function fixture(prefix) {
  const base = process.env.PI_TEST_TMP_ROOT ?? path.join('/tmp/pi', process.env.PI_SESSION_ID ?? 'extension-tests', 'scratch');
  fs.mkdirSync(base, {recursive: true, mode: 0o700});
  return fs.mkdtempSync(path.join(base, prefix));
}
export function sdkRoot() {
  if (process.env.PI_TEST_SDK_ROOT) return fs.realpathSync(process.env.PI_TEST_SDK_ROOT);
  // pnpm 11 globals have per-package hashed directories; root -g is not
  // necessarily a node_modules directory. Ask pnpm for the installed path.
  const entries = JSON.parse(execFileSync('pnpm', ['list', '-g', '--depth', '0', '--json'], {encoding: 'utf8'}));
  const installed = entries.map(e => e.dependencies?.['@earendil-works/pi-coding-agent']?.path).find(Boolean);
  if (!installed) throw new Error('Set PI_TEST_SDK_ROOT to the installed pi package directory');
  return fs.realpathSync(installed);
}
export async function sdk() {return import(pathToFileURL(path.join(sdkRoot(), 'dist/index.js')));}
export const agentDir = () => process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), '.pi/agent');
export const probeMessage = name => ({role:'assistant',content:[{type:'toolCall',id:'probe',name,arguments:{}}],api:'openai-responses',provider:'openai',model:'test-fixture',stopReason:'toolUse',timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}});
