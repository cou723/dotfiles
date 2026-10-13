import upstream from 'pi-subagents';
import { registerAgent } from 'pi-subagents/agents';
import { registerRequiredChildExtensions } from 'pi-subagents/required-child-extensions';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { fileURLToPath } from 'node:url';
import { discoverClaudeAgents } from './compat.mjs';

export default async function (pi: ExtensionAPI) {
  let mandatory: { dispose(): void } | undefined;
  let mandatorySessionId: string | undefined;
  let agents: { dispose(): void }[] = [];
  let diagnostics: string[] = [];
  const clear = () => {
    mandatory?.dispose(); mandatory = undefined; mandatorySessionId = undefined;
    for (const agent of agents) agent.dispose();
    agents = [];
  };
  // Register before upstream's session_start refreshes the advertised catalog.
  pi.on('session_start', (_event, ctx) => {
    clear();
    mandatory = registerRequiredChildExtensions({
      sessionId: ctx.sessionManager.getSessionId(),
      requireForAllRunners: true,
      extensions: [
        { id: 'permission-system', path: '@PERMISSION@' },
        { id: 'permission-auto-review', path: '@AUTO_REVIEW@' },
      ],
    });
    mandatorySessionId = ctx.sessionManager.getSessionId();
    const discovered = discoverClaudeAgents(ctx.cwd, ctx.isProjectTrusted());
    diagnostics = [...discovered.errors];
    for (const agent of discovered.agents) {
      try {
        agents.push(registerAgent({ pi, name: `claude-${agent.name}`, definition: agent.error ? {
          description: `UNAVAILABLE: ${agent.error}`.slice(0, 4000),
          systemPrompt: 'This agent is unavailable because its Claude definition is unsupported.',
          tools: [], allowNestedSubagents: false,
          subagentOnlyExtensions: [fileURLToPath(new URL('./blocked.mjs', import.meta.url))],
        } : agent.definition }));
      } catch (error) {
        diagnostics.push(`${agent.file}: ${error.message}`);
      }
    }
    if (diagnostics.length) ctx.ui.notify(`Claude agents: ${diagnostics.join('\n')}`, 'warning');
  });
  pi.on('session_shutdown', clear);
  pi.on('tool_call', (event, ctx) => {
    if (event.toolName === 'subagent' && (!mandatory || mandatorySessionId !== ctx.sessionManager.getSessionId())) {
      return { block: true, reason: 'Subagent permission prerequisites did not initialize. Reload or restart Pi; execution is denied.' };
    }
  });
  pi.registerCommand('claude-agents', {
    description: 'Report Claude agent compatibility errors; /reload refreshes definitions',
    handler: async (_args, ctx) => {
      ctx.ui.notify(diagnostics.length ? diagnostics.join('\n') : 'Claude agent definitions: no compatibility errors. Use /subagents to list agents.', diagnostics.length ? 'warning' : 'info');
    },
  });
  await upstream(pi);
}
