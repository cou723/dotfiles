import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'yaml';

const aliases = { Read: 'read', Write: 'write', Edit: 'edit', Bash: 'bash', Grep: 'grep', Glob: 'find', LS: 'ls' };
const supported = new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode', 'background', 'color']);
const builtins = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'];
function toolList(value) {
  if (value === undefined) return undefined;
  const list = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(list) || list.some(x => typeof x !== 'string' || !x.trim())) throw new Error('tools must be a nonempty comma-separated string or string list');
  return list.map(x => {
    const name = x.trim();
    if (name.includes('(')) throw new Error(`Tool specifiers are unsupported: ${name}`);
    const mapped = aliases[name] ?? name;
    if (!builtins.includes(mapped)) throw new Error(`Unsupported Claude tool: ${name}`);
    return mapped;
  });
}
export function convertAgent(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) throw new Error('Missing YAML frontmatter');
  const f = parse(match[1]);
  if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error('Invalid frontmatter');
  for (const key of Object.keys(f)) if (!supported.has(key)) throw new Error(`Unsupported Claude field: ${key}`);
  if (typeof f.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(f.name)) throw new Error('Invalid agent name');
  if (typeof f.description !== 'string' || !f.description.trim() || !match[2].trim()) throw new Error('description and system prompt are required');
  if (f.permissionMode !== undefined && f.permissionMode !== 'default' && f.permissionMode !== 'plan') throw new Error(`Unsupported permissionMode: ${f.permissionMode}; permissions cannot be bypassed`);
  if (f.background !== undefined && typeof f.background !== 'boolean') throw new Error('background must be boolean');
  let model;
  if (f.model !== undefined && f.model !== 'inherit') {
    if (typeof f.model !== 'string' || !f.model.trim()) throw new Error('Invalid model');
    if (['sonnet', 'opus', 'haiku', 'fable'].includes(f.model)) throw new Error(`Model alias ${f.model} needs an explicit Pi provider/model ID`);
    model = f.model;
  }
  const tools = toolList(f.tools) ?? builtins;
  const denied = toolList(f.disallowedTools) ?? [];
  if (f.permissionMode === 'plan') denied.push('bash', 'edit', 'write');
  return { name: f.name, definition: {
    description: f.description.trim(), systemPrompt: match[2].trim(),
    // A closed builtin loadout avoids accidentally granting ambient extension tools.
    tools: tools.filter(t => !denied.includes(t)),
    allowNestedSubagents: false, defaultContext: 'fresh',
    systemPromptMode: 'replace', inheritProjectContext: true, inheritGlobalContext: true,
    inheritSkills: false, ...(model ? { model } : {}),
    ...(f.background !== undefined ? { defaultAsync: f.background } : {}),
  } };
}
export function discoverClaudeAgents(cwd, trusted, home = os.homedir()) {
  const dirs = [path.join(home, '.claude', 'agents')];
  if (trusted) {
    // Stop at the nearest git checkout boundary; parent directory prompts must not leak in.
    const ancestors = [];
    let dir = path.resolve(cwd);
    while (true) {
      ancestors.unshift(path.join(dir, '.claude', 'agents'));
      if (fs.existsSync(path.join(dir, '.git')) || path.dirname(dir) === dir) break;
      dir = path.dirname(dir);
    }
    dirs.push(...ancestors);
  }
  const agents = new Map();
  const errors = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      if (!entry.name.endsWith('.md') || (!entry.isFile() && !entry.isSymbolicLink())) continue;
      const file = path.join(dir, entry.name);
      let name = entry.name.slice(0, -3);
      try {
        const text = fs.readFileSync(file, 'utf8');
        // Preserve the declared name even when other frontmatter fields are unsupported.
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
        const declared = fm && parse(fm[1])?.name;
        if (typeof declared === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(declared)) name = declared;
        const agent = convertAgent(text);
        agents.set(agent.name, { ...agent, file });
      } catch (error) {
        const message = `${file}: ${error.message}`;
        errors.push(message);
        // Shadow lower-priority definitions too; never fall back to a more permissive agent.
        agents.set(name, { name, file, error: message });
      }
    }
  }
  return { agents: [...agents.values()], errors };
}
