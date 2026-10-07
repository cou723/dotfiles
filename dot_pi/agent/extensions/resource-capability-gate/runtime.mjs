import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {immutablePaths} from './policy.mjs';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultAgentDir = () => process.env.PI_CODING_AGENT_DIR ?? process.env.PI_AGENT_DIR ?? path.join(os.homedir(), '.pi/agent');
export const runtimePath = agentDir => path.join(agentDir, 'resource-capability-runtime.json');
export const grantsPath = agentDir => path.join(agentDir, 'resource-capability-gate.json');

function absolute(value) {
  if (typeof value !== 'string' || (!path.isAbsolute(value) && !value.startsWith('~/'))) throw new Error('Runtime paths must be absolute or ~/ paths');
  return value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : path.resolve(value);
}
export function loadRuntime(agentDir = defaultAgentDir()) {
  agentDir = absolute(agentDir);
  // Global-only trusted input: neither cwd nor project config selects this file.
  const config = JSON.parse(fs.readFileSync(runtimePath(agentDir), 'utf8'));
  if (config?.version !== 1 || !Array.isArray(config.protectedRoots) || !config.lspServers || typeof config.lspServers !== 'object' || Array.isArray(config.lspServers)) throw new Error('Invalid resource capability runtime config');
  const roots = config.protectedRoots.map(absolute);
  const servers = Object.create(null);
  for (const [name, entry] of Object.entries(config.lspServers)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name) || !Array.isArray(entry?.command) || !entry.command.length || entry.command.some(s => typeof s !== 'string' || !s.length || s.includes('\0'))) throw new Error('Invalid LSP command argv');
    servers[name] = entry.command.map(s => s === '{node}' ? process.execPath : s.startsWith('~/') ? absolute(s) : s);
  }
  // Never let personal config remove protection for the loaded package itself.
  // Keep lexical AND real paths, including targets outside agentDir via symlinks.
  const protectedRoots = immutablePaths(agentDir, [packageRoot, ...roots]);
  return {agentDir, protectedRoots, lspServers: servers};
}
export function loadGrants(agentDir, validate) {
  return validate(JSON.parse(fs.readFileSync(grantsPath(agentDir), 'utf8')));
}
