import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { inside, canonical, immutablePaths } from './policy.mjs';

export function sandboxArgs(cwd, scratch, {agentDir, protectedRoots = []}, command, {readOnlyWorkspace = false} = {}) {
  cwd = canonical(cwd);
  const home = os.homedir();
  const immutable = immutablePaths(agentDir, protectedRoots);
  if ([path.parse(cwd).root, home, '/tmp', '/tmp/pi'].includes(cwd) || inside(canonical(agentDir), cwd) || (!readOnlyWorkspace && immutable.some(p => inside(p, cwd))))
    throw new Error('このcwdではsandboxのwritable workspaceを安全に設定できません。project directoryで起動してください。');
  const args = ['--die-with-parent', '--new-session', '--unshare-pid', '--unshare-net', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/run', '--tmpfs', '/tmp', '--ro-bind', '/tmp/pi', '/tmp/pi', readOnlyWorkspace ? '--ro-bind' : '--bind', cwd, cwd, '--bind', scratch, scratch];
  // Reapply immutable roots after binding a writable workspace containing a checkout.
  for (const p of [...immutable, path.join(cwd, '.pi', 'lsp.json'), path.join(cwd, '.pi', 'extensions'), path.join(cwd, '.pi', 'settings.json'), path.join(cwd, '.pi', 'mcp.json'), path.join(cwd, '.git', 'config'), path.join(cwd, '.git', 'hooks')])
    if (fs.existsSync(p)) args.push('--ro-bind', canonical(p), canonical(p));
  for (const p of [agentDir, path.join(agentDir, 'auth.json'), path.join(agentDir, 'mcp-auth.json'), path.join(home, '.ssh'), path.join(home, '.aws'), path.join(home, '.gnupg'), path.join(home, '.config', 'gh'), path.join(home, '.secrets'), ...fs.readdirSync(cwd).filter(n => n === '.env' || n.startsWith('.env.')).map(n => path.join(cwd, n))]) {
    if (!fs.existsSync(p)) continue;
    const real = canonical(p);
    if (fs.statSync(real).isDirectory()) args.push('--tmpfs', real);
    else args.push('--ro-bind', '/dev/null', real);
  }
  return [...args, '--chdir', cwd, '--', '/bin/bash', '--noprofile', '--norc', '-c', command];
}
/** @returns {import('@earendil-works/pi-coding-agent').BashOperations} */
export function sandboxOperations(scratch, boundary) {
  return {
    async exec(command, cwd, {onData, signal, timeout, env}) {
      if (process.platform !== 'linux') throw new Error('この補助sandboxはLinux/bubblewrap専用です。非対応環境ではbashを実行しません。');
      if (signal?.aborted) throw new Error('aborted');
      fs.mkdirSync(scratch, {recursive: true, mode: 0o700});
      if (fs.lstatSync(scratch).isSymbolicLink() || fs.statSync(scratch).uid !== process.getuid()) throw new Error('Invalid scratch directory');
      fs.chmodSync(scratch, 0o700);
      const args = sandboxArgs(cwd, scratch, boundary, command);
      const safeEnv = {};
      for (const key of ['PATH','HOME','USER','LOGNAME','LANG','LC_ALL','TERM','COLORTERM','PNPM_HOME','NIX_PATH','NIX_SSL_CERT_FILE','SSL_CERT_FILE','TZ']) if ((env ?? process.env)[key]) safeEnv[key] = (env ?? process.env)[key];
      safeEnv.TMPDIR = scratch;
      return new Promise((resolve, reject) => {
        const child = spawn('bwrap', args, {cwd, env: safeEnv, detached: true, stdio: ['ignore','pipe','pipe']});
        const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } };
        let expired = false;
        const timer = timeout > 0 ? setTimeout(() => {expired = true; kill();}, timeout * 1000) : undefined;
        child.stdout.on('data', onData); child.stderr.on('data', onData);
        signal?.addEventListener('abort', kill, {once: true});
        if (signal?.aborted) kill();
        const cleanup = () => {clearTimeout(timer); signal?.removeEventListener('abort', kill);};
        child.on('error', e => {cleanup(); reject(e);});
        child.on('close', code => {cleanup(); if (signal?.aborted) reject(new Error('aborted')); else if (expired) reject(new Error(`timeout:${timeout}`)); else resolve({exitCode: code ?? 137});});
      });
    },
  };
}
