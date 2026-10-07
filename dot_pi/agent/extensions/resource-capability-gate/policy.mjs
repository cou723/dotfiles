import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const inside = (root, target) => target === root || target.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
export const expand = (p, cwd) => {
  if (p.startsWith('file:') || /[\u00a0\u2000-\u200a\u202f\u205f\u3000]/.test(p)) throw new Error('通常の絶対pathで指定してください。file URL/Unicode space pathはこのGateでは未対応です。');
  return path.resolve(cwd, p === '~' ? os.homedir() : p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);
};
export function canonical(p) {
  try { return fs.realpathSync(p); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const parent = path.dirname(p);
    if (parent === p) throw e;
    return path.join(canonical(parent), path.basename(p));
  }
}
/** @param {string} agentDir @param {string[]} protectedRoots */
export function immutablePaths(agentDir, protectedRoots = []) {
  const paths = [path.join(agentDir, 'extensions'), path.join(agentDir, 'npm'), path.join(agentDir, 'trust'),
    ...['settings.json', 'mcp.json', 'auth.json', 'mcp-auth.json', 'hermes-memory-config.json', 'subagents.json', 'AGENTS.md', 'lsp.json', 'resource-capability-runtime.json', 'resource-capability-gate.json'].map(f => path.join(agentDir, f)),
    path.join(os.homedir(), '.ssh'), path.join(os.homedir(), '.aws'), path.join(os.homedir(), '.gnupg'), ...protectedRoots];
  return [...new Set(paths.flatMap(p => [path.resolve(p), canonical(p)]))];
}
/** @param {string} p @param {string} agentDir @param {string[]} protectedRoots */
export function protectedPath(p, agentDir, protectedRoots = []) {
  return immutablePaths(agentDir, protectedRoots).some(r => inside(r, p));
}
/** @param {{inputPath:string,cwd:string,agentDir:string,protectedRoots?:string[],operation:string,scratch:string,owned?:Set<string>}} options */
export function filesystemDecision({inputPath, cwd, agentDir, protectedRoots = [], operation, scratch, owned = new Set()}) {
  const lexical = expand(inputPath, cwd), real = canonical(lexical);
  if (operation !== 'read' && (protectedPath(lexical, agentDir, protectedRoots) || protectedPath(real, agentDir, protectedRoots)))
    return {state: 'deny', reason: '認可設定・拡張・credentialはagentから変更できません。人間のeditor/chezmoiで変更してください。'};
  if (inside('/tmp/pi', lexical) && !inside(canonical('/tmp/pi'), real))
    return {state: 'deny', reason: '/tmp/piのgrantはsymlink等による領域外アクセスには適用されません。'};
  if (operation !== 'read' && real === canonical('/tmp/pi')) return {state: 'deny', reason: '/tmp/pi本体は変更できません。配下の成果物pathを指定してください。'};
  if (operation === 'delete') {
    if ([path.parse(real).root, os.homedir(), canonical(cwd), canonical('/tmp/pi'), canonical(scratch)].includes(real))
      return {state: 'deny', reason: 'root、home、workspace、/tmp/pi、scratch本体の削除は禁止です。'};
    if (real.split(path.sep).some(p => ['.git', '.pi'].includes(p)))
      return {state: 'deny', reason: '管理・認可領域は削除できません。'};
    if (inside(canonical(scratch), real)) return {state: 'allow', path: real};
    const workspace = canonical(cwd);
    if (![path.parse(workspace).root, os.homedir(), '/tmp', canonical('/tmp/pi')].includes(workspace) && inside(workspace, real))
      return {state: 'ask', path: real, reason: 'workspace内の削除には対象確認が必要です。'};
    if (inside(canonical('/tmp/pi'), real)) return {state: 'deny', reason: '他タスクや共有成果物の削除は許可されていません。自session scratchを使用してください。'};
    return {state: 'deny', reason: '削除対象はworkspace内または自session scratchに限定します。'};
  }
  if (operation !== 'read' && inside('/tmp/pi', lexical) && fs.existsSync(real) && !inside(scratch, real) && !owned.has(real))
    return {state: 'ask', path: real, reason: '既存の共有成果物を変更します（今回のsessionで作成したファイルではありません）。'};
  return {state: 'allow', path: real};
}

// A deliberately small literal rm grammar, NOT a shell parser. Complex rm commands fail closed.
export function literalRm(command) {
  if (!/^\s*(?:\/usr\/bin\/|\/bin\/)?rm(?:\s|$)/.test(command)) return null;
  const words = command.trim().match(/'[^']*'|"[^"$`\\]*"|[^\s'"$`\\;|&<>(){}*?\[\]\n]+/g);
  if (!words || words.join(' ') !== command.trim().replace(/\s+/g, ' ') || /[\n\r]/.test(command)) throw new Error('rmは単独のliteral commandで指定してください。変数・glob・chain・wrapperは許可しません。');
  const args = words.slice(1).map(w => /^["']/.test(w) ? w.slice(1, -1) : w);
  let operands = false;
  const targets = [];
  for (const a of args) {
    if (!operands && a === '--') { operands = true; continue; }
    if (!operands && /^-[rfR]+$/.test(a)) continue;
    if (!operands && a.startsWith('-')) throw new Error('未対応のrm optionです。-r/-R/-f/--のみ使用できます。');
    if (!a || /[$`*?\[\]{}\n\r]/.test(a)) throw new Error('削除対象がliteralではありません。');
    targets.push(a);
  }
  if (!targets.length) throw new Error('削除対象がありません。');
  return targets;
}

const READ_TOOLS = {
  github: new Set(['get_me','get_file_contents','list_branches','list_commits','get_commit','list_issues','search_issues','search_pull_requests','search_code','search_repositories','list_pull_requests','get_issue','get_issue_comments','get_pull_request','get_pull_request_comments','get_pull_request_files','get_pull_request_reviews','get_pull_request_status','get_repository']),
  slack: new Set(['slack_search_messages','slack_search_channels','slack_search_users','slack_read_channel','slack_read_thread','slack_read_user_profile','slack_get_thread_replies','slack_get_channel_history','slack_list_channels','slack_get_reactions']),
  backlog: new Set(['get_myself','get_projects','get_project','get_issue','get_issues','get_issue_comments','get_pull_request','get_pull_requests','get_pull_request_comments','get_git_repositories','get_git_repository','get_users','get_space']),
};
export function normalize(domain, tool, args) {
  if (READ_TOOLS[domain]?.has(tool) || (domain === 'github' && ['issue_read','pull_request_read','actions_get','actions_list'].includes(tool)))
    return {domain, action: 'read', resource: {}, payload: args};
  if (domain === 'github' && tool === 'add_issue_comment') {
    if (!/^[A-Za-z0-9_.-]+$/.test(args.owner ?? '') || !/^[A-Za-z0-9_.-]+$/.test(args.repo ?? '') || !Number.isSafeInteger(args.issue_number) || args.issue_number <= 0 || typeof args.body !== 'string')
      throw new Error('GitHub commentのresource/bodyを正規化できません。');
    return {domain, action: 'comment.create', resource: {repo: `${args.owner}/${args.repo}`, number: args.issue_number}, payload: args};
  }
  if (domain === 'slack' && ['slack_send_message','slack_post_message','slack_reply_to_thread'].includes(tool)) {
    const channel = args.channel_id ?? args.channel, thread = args.thread_ts;
    if (typeof channel !== 'string' || !/^[CG][A-Z0-9]+$/.test(channel) || (thread !== undefined && (typeof thread !== 'string' || !/^\d+\.\d+$/.test(thread))))
      throw new Error('Slack channel/threadを正規化できません。');
    return {domain, action: thread ? 'thread.reply' : 'channel.post', resource: {channel, thread}, payload: args};
  }
  return {domain, action: 'unknown.write', resource: {}, payload: args};
}
export function validateConfig(c) {
  if (!c || c.version !== 1 || !Array.isArray(c.githubGrants) || !Array.isArray(c.slackGrants) || !c.servers || Object.values(c.servers).some(d => !['github','slack','backlog'].includes(d))) throw new Error('Invalid capability config');
  for (const g of c.githubGrants) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(g.repo ?? '') || !['issue','pr'].includes(g.kind) || !['any','assignee','reviewer','author'].includes(g.relation) || (g.number !== undefined && (!Number.isSafeInteger(g.number) || g.number <= 0))) throw new Error('Invalid GitHub grant');
  }
  for (const g of c.slackGrants) {
    if (!/^T[A-Z0-9]+$/.test(g.workspace ?? '') || !/^[CG][A-Z0-9]+$/.test(g.channel ?? '') || (g.thread !== undefined && !/^\d+\.\d+$/.test(g.thread)) || typeof g.mentionedOnly !== 'boolean') throw new Error('Invalid Slack grant');
  }
  return c;
}
export async function capabilityDecision(op, config, getJson) {
  if (op.action === 'read') return 'allow';
  if (op.domain === 'backlog') return 'ask';
  if (op.domain === 'github' && op.action === 'comment.create') {
    const candidates = config.githubGrants.filter(g => g.repo.toLowerCase() === op.resource.repo.toLowerCase() && (g.number === undefined || g.number === op.resource.number));
    if (!candidates.length) return 'ask';
    const base = `/repos/${op.resource.repo}`;
    const issue = await getJson('github', `${base}/issues/${op.resource.number}`);
    const me = await getJson('github', '/user');
    if (!me?.login || !Array.isArray(issue.assignees)) throw new Error('GitHub facts unavailable');
    const kind = issue.pull_request ? 'pr' : 'issue';
    for (const g of candidates) {
      if (g.kind !== kind) continue;
      if (g.relation === 'any' || (g.relation === 'assignee' && issue.assignees.some(a => a.login === me.login)) || (g.relation === 'author' && issue.user?.login === me.login)) return 'allow';
      if (g.relation === 'reviewer' && kind === 'pr') {
        const pr = await getJson('github', `${base}/pulls/${op.resource.number}`);
        if (pr.requested_reviewers?.some(a => a.login === me.login)) return 'allow';
      }
    }
    return 'ask';
  }
  if (op.domain === 'slack' && op.action === 'thread.reply') {
    // Broadcast/scheduled/blocks/attachments are not granted by a plain-text reply capability.
    if (Object.keys(op.payload).some(k => !['channel','channel_id','thread_ts','text'].includes(k)) || typeof op.payload.text !== 'string') return 'ask';
    const candidates = config.slackGrants.filter(g => g.channel === op.resource.channel && (!g.thread || g.thread === op.resource.thread));
    if (!candidates.length) return 'ask';
    const me = await getJson('slack', 'auth.test');
    if (!me?.ok || !me.team_id || !me.user_id) throw new Error('Slack identity unavailable');
    for (const g of candidates) {
      if (g.workspace !== me.team_id) continue;
      if (!g.mentionedOnly) return 'allow';
      // No truncated/paginated evidence is accepted. Large threads defer to human approval.
      const replies = await getJson('slack', `conversations.replies?channel=${encodeURIComponent(op.resource.channel)}&ts=${encodeURIComponent(op.resource.thread)}&limit=100`);
      if (!replies.ok || replies.has_more || replies.response_metadata?.next_cursor || !Array.isArray(replies.messages)) throw new Error('Slack thread evidence incomplete');
      if (replies.messages.some(m => typeof m.text === 'string' && m.text.includes(`<@${me.user_id}>`))) return 'allow';
    }
  }
  return 'ask';
}
