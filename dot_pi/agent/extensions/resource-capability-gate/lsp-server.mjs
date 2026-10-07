import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sandboxArgs} from './sandbox.mjs';
import {canonical} from './policy.mjs';
import {loadRuntime, defaultAgentDir} from './runtime.mjs';

export function launchPlan(name, cwd, scratch, agentDir = defaultAgentDir()) {
  if (process.platform !== 'linux') throw new Error('LSP sandbox requires Linux/bubblewrap; no unsandboxed fallback.');
  const boundary = loadRuntime(agentDir);
  if (!Object.hasOwn(boundary.lspServers, name)) throw new Error('Unknown LSP server');
  cwd = canonical(cwd);
  const args = sandboxArgs(cwd, scratch, boundary, 'unused');
  const workspaceBind = args.findIndex((v, i) => v === '--bind' && args[i + 1] === cwd && args[i + 2] === cwd);
  if (workspaceBind < 0) throw new Error('Missing sandbox workspace bind');
  args[workspaceBind] = '--ro-bind'; // LSP servers/plugins cannot rewrite sources.
  // Replace the shell command with direct argv; preserve --chdir and separator.
  args.splice(args.length - 5, 5, ...boundary.lspServers[name]);
  const env = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'NIX_PATH', 'TZ'])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {TMPDIR: scratch, XDG_CACHE_HOME: scratch, XDG_STATE_HOME: scratch});
  return {args, env};
}

async function main() {
  const scratch = fs.mkdtempSync('/tmp/pi/lsp-');
  fs.chmodSync(scratch, 0o700);
  let child;
  const stop = () => {child?.kill('SIGTERM');};
  try {
    if (process.argv.length !== 4) throw new Error('Expected <agent-dir> <configured-server-name>');
    const {args, env} = launchPlan(process.argv[3], process.cwd(), scratch, process.argv[2]);
    child = spawn('bwrap', args, {env, stdio: 'inherit'});
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
    const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('close', c => resolve(c ?? 1));});
    process.exitCode = code;
  } finally {
    process.off('SIGTERM', stop); process.off('SIGINT', stop);
    fs.rmSync(scratch, {recursive: true, force: true});
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
