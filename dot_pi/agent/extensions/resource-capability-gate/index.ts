import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createBashToolDefinition, getAgentDir, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { canonical, filesystemDecision, literalRm, normalize, validateConfig, capabilityDecision } from './policy.mjs';
import { sandboxOperations } from './sandbox.mjs';
import { loadRuntime, loadGrants } from './runtime.mjs';

const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const printable = (v: unknown) => JSON.stringify(v, null, 2).replace(/[\u007f-\u009f\u001b\u202a-\u202e\u2066-\u2069]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export default async function(pi: ExtensionAPI) {
  const agentDir = getAgentDir();
  const require = createRequire(path.join(agentDir, 'npm', 'package.json'));
  const {getPermissionsService} = await import(pathToFileURL(require.resolve('@gotgenes/pi-permission-system')).href);
  let disposeAuthorizer: (() => void) | undefined;
  // Deterministic delegation: permission-system only bypasses its generic MCP ask
  // while THIS independent tool_call gate is loaded. Missing provider => human ask.
  pi.events.on('permissions:ready', (event: any) => {
    if (disposeAuthorizer || !event?.sessionId) return;
    const service = getPermissionsService(event.sessionId);
    if (!service) return;
    disposeAuthorizer = service.registerAuthorizer('resource-tool-gate', async (details: any) =>
      details.payload?.request?.surface === 'mcp' && details.toolName?.startsWith('mcp__')
        ? {kind: 'allow'} : {kind: 'defer'});
  });
  pi.on('session_shutdown', () => {disposeAuthorizer?.(); disposeAuthorizer = undefined;});
  const boundary = () => loadRuntime(agentDir);
  const owned = new Set<string>();
  const pending = new Map<string, string>();
  let sessionId = 'uninitialized';
  let confirmQueue: Promise<unknown> = Promise.resolve();
  const scratch = () => path.join('/tmp/pi', sessionId, 'scratch');
  const config = () => loadGrants(agentDir, validateConfig);
  const audit = (toolName: string, state: string, input: unknown, resource: unknown = {}) =>
    pi.appendEntry('resource-capability-decision', {toolName, state, inputHash: digest(input), resource});

  async function confirm(ctx: any, title: string, input: unknown) {
    if (!ctx.hasUI) return false;
    const text = printable(input);
    // Never approve a payload the user cannot inspect in full.
    if (text.length > 24000) return false;
    const run = () => ctx.ui.confirm(title, text, {timeout: 300000});
    const response = confirmQueue.then(run, run);
    confirmQueue = response.catch(() => false);
    return response;
  }
  async function getJson(domain: string, endpoint: string) {
    const token = process.env[domain === 'github' ? 'GITHUB_MCP_TOKEN' : 'SLACK_CAPABILITY_TOKEN'];
    if (!token) throw new Error('Metadata credential is missing');
    const url = domain === 'github' ? `https://api.github.com${endpoint}` : `https://slack.com/api/${endpoint}`;
    const r = await fetch(url, {headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'}, signal: AbortSignal.timeout(5000), redirect: 'error'});
    if (!r.ok) throw new Error(`Metadata HTTP ${r.status}`);
    return r.json();
  }
  function metadataIdentityBound(server: string, domain: string, ctx: any) {
    const global = JSON.parse(fs.readFileSync(path.join(agentDir, 'mcp.json'), 'utf8'));
    let entry = global.mcpServers?.[server];
    const projectFile = path.join(ctx.cwd, '.pi', 'mcp.json');
    if (ctx.isProjectTrusted() && fs.existsSync(projectFile)) {
      const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
      entry = project.mcpServers?.[server] ?? entry;
    }
    const tokenEnv = domain === 'github' ? 'GITHUB_MCP_TOKEN' : 'SLACK_CAPABILITY_TOKEN';
    const endpoint = domain === 'github' ? 'https://api.githubcopilot.com/mcp/' : 'https://mcp.slack.com/mcp';
    return entry?.url === endpoint && entry.headers?.Authorization === `Bearer \${${tokenEnv}}`;
  }
  const decision = (inputPath: string, operation: string, ctx: any) => filesystemDecision({inputPath, operation, cwd: ctx.cwd, ...boundary(), scratch: scratch(), owned});

  pi.on('session_start', async (_e, ctx) => {
    sessionId = ctx.sessionManager.getSessionId();
    if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) throw new Error('Invalid session ID');
    fs.mkdirSync(scratch(), {recursive: true, mode: 0o700});
    owned.clear(); pending.clear();
    for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === 'custom' && e.customType === 'resource-capability-owned' && typeof (e.data as any)?.path === 'string') owned.add((e.data as any).path);
    }
    try {config(); boundary(); ctx.ui.setStatus('resource-capability', 'capability: guarded | bash: bwrap/no-net');}
    catch {ctx.ui.setStatus('resource-capability', 'capability: INVALID (fail closed)');}
  });

  const bash = createBashToolDefinition(process.cwd());
  pi.registerTool({
    ...bash,
    label: 'bash (resource sandbox)',
    description: bash.description + '\nLinux bubblewrap: writes only to workspace and this session scratch; no network/credential environment. Save shared /tmp/pi documents via write/edit tools. No unsandboxed fallback.',
    execute: (id, params, signal, onUpdate, ctx) => createBashToolDefinition(ctx.cwd, {operations: sandboxOperations(scratch(), boundary())}).execute(id, params, signal, onUpdate, ctx),
  });
  pi.on('user_bash', () => ({operations: sandboxOperations(scratch(), boundary())}));

  pi.on('tool_call', async (event, ctx) => {
    try {
      const c = config(); // Invalid/missing global config blocks EVERY tool.
      boundary();
      const input = event.input as Record<string, any>;
      const hash = digest(input);
      const deny = (reason: string) => {audit(event.toolName, 'deny', input); return {block: true, reason: `[resource-capability] ${reason}`};};
      if (['exec_command','powershell'].includes(event.toolName)) return deny('実行経路はsandbox付きbashに限定します。');
      if (typeof input.path === 'string') {
        // Unknown path-bearing tools are conservatively treated as writers.
        const readOnly = ['read','grep','find','ls','lsp_diagnostics','lsp_hover','lsp_definition','lsp_references','lsp_symbols'].includes(event.toolName);
        const d = decision(input.path, readOnly ? 'read' : 'write', ctx);
        if (d.state === 'deny') return deny(d.reason!);
        if (d.state === 'ask' && !(await confirm(ctx, '既存の/tmp/pi成果物を変更しますか？', {path: d.path, input}))) return deny('共有成果物の変更が承認されませんでした。');
        if (digest(input) !== hash) return deny('承認中に入力が変更されました。');
        if (['write','edit'].includes(event.toolName)) pending.set(event.toolCallId, canonical(d.path!));
      }
      if (event.toolName === 'bash') {
        const command = input.command;
        if (typeof command !== 'string') return deny('commandが不正です。');
        const rm = literalRm(command);
        if (rm) {
          const targets = rm.map(p => decision(p, 'delete', ctx));
          const blocked = targets.find(d => d.state === 'deny');
          if (blocked) return deny(blocked.reason!);
          if (targets.some(d => d.state === 'ask') && !(await confirm(ctx, '削除対象を確認してください', {command, targets: targets.map(d => d.path)}))) return deny('削除が承認されませんでした。');
        } else if (/(?:^|[\s;|&()])(?:[^\s;|&()]*\/)?rm(?:\s|$)/.test(command) || /\bfind\b[\s\S]*\s-delete\b/.test(command)) {
          return deny('削除は単独のliteral rm commandで指定してください。chain/変数/wrapper/find -deleteは認可できません。');
        }
        // Service writes must use the MCP gate. All bash networking is also blocked by bwrap.
        if (/\bgh\s+(?:api|issue|pr|repo)\b/.test(command)) return deny('GitHub操作はResource capability付きMCP経路を使用してください。');
        if (digest(input) !== hash) return deny('承認中にcommandが変更されました。');
      }
      const match = /^mcp__([^]+?)__(.+)$/.exec(event.toolName);
      if (match) {
        const domain = c.servers[match[1]];
        // Unknown MCP servers do not acquire blanket classifier-based approval.
        const op = domain ? normalize(domain, match[2], input) : {domain: 'unknown', action: 'unknown.write', resource: {}, payload: input};
        let state = 'ask';
        try {
          // Auto grants require metadata and MCP to use the SAME credential/identity.
          // OAuth Slack with a separate API token cannot establish that binding: ask instead.
          state = domain && (op.action === 'read' || domain === 'backlog' || metadataIdentityBound(match[1], domain, ctx))
            ? await capabilityDecision(op, c, getJson) : 'ask';
        } catch {state = 'ask';}
        if (state !== 'allow') {
          if (!(await confirm(ctx, `${op.domain}: ${op.action} — 今回の操作だけ承認しますか？`, {tool: event.toolName, resource: op.resource, arguments: input}))) return deny('外部操作が承認されませんでした。UIなし・metadata不足時も自動実行しません。');
        }
        if (digest(input) !== hash) return deny('承認中に宛先/本文が変更されました。');
        audit(event.toolName, state === 'allow' ? 'capability_allow' : 'human_allow_once', input, op.resource);
      }
      return undefined;
    } catch (e) {
      return {block: true, reason: `[resource-capability] fail closed: ${e instanceof Error ? e.message : 'unknown error'}`};
    }
  });
  pi.on('tool_result', event => {
    const p = pending.get(event.toolCallId);
    pending.delete(event.toolCallId);
    if (p && !event.isError) {owned.add(p); pi.appendEntry('resource-capability-owned', {path: p});}
  });
  pi.registerCommand('capabilities', {
    description: 'Show active global Resource capability grants and scratch (no secrets)',
    handler: async (_args, ctx) => {ctx.ui.notify(printable({config: config(), protectedRoots: boundary().protectedRoots, scratch: scratch(), ownedFiles: [...owned], sandbox: 'Linux bwrap, no network, no unsandboxed fallback'}), 'info');},
  });
}
