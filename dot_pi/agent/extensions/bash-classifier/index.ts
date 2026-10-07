import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {complete} from '@earendil-works/pi-ai/compat';
import {getAgentDir, type ExtensionAPI} from '@earendil-works/pi-coding-agent';

// Reuse the pinned upstream reviewer, but bound its authority in CODE to bash.
// The upstream extension's ignored `surfaces` option cannot enforce this boundary.
export default async function(pi: ExtensionAPI) {
  const agentDir = getAgentDir();
  const require = createRequire(path.join(agentDir, 'npm', 'package.json'));
  const root = path.dirname(fs.realpathSync(require.resolve('pi-permission-classifier/package.json')));
  const {createClassifierReviewer} = await import(pathToFileURL(path.join(root, 'src/reviewer.ts')).href);
  const {loadClassifierConfig} = await import(pathToFileURL(path.join(root, 'src/config-loader.ts')).href);
  const permissionsPath = require.resolve('@gotgenes/pi-permission-system');
  const {getPermissionsService} = await import(pathToFileURL(permissionsPath).href);
  let context: any, model: any, override: any, dispose: (() => void) | undefined;
  pi.on('session_start', (_e, ctx) => {context = ctx; model = ctx.model;});
  pi.on('model_select', e => {model = e.model;});
  const reviewer = createClassifierReviewer({
    getConfig: () => {
      if (!context) return undefined;
      // Global-only: project files cannot replace the safety rubric/model.
      const result = loadClassifierConfig({cwd: context.cwd, agentDir, projectTrusted: false});
      return result.config ? {...result.config, ...override} : undefined;
    },
    getSessionModel: () => model,
    getRegistry: () => context?.modelRegistry,
    complete,
  });
  pi.events.on('permissions:ready', (event: any) => {
    if (dispose || !event?.sessionId) return;
    const service = getPermissionsService(event.sessionId);
    if (!service) return;
    dispose = service.registerAuthorizer('bash-classifier', async (details: any, query: any, log: any) => {
      if (details.payload?.request?.surface !== 'bash') return {kind: 'defer'};
      return reviewer(details, query, log);
    });
    context?.ui.setStatus('bash-classifier', 'judge: bash-only (global policy)');
  });
  pi.on('session_shutdown', () => {dispose?.(); dispose = undefined; context = undefined; model = undefined; override = undefined;});
  pi.registerCommand('permission-model', {
    description: 'Set bash reviewer model for this session: provider/model or session; persistent config is chezmoi-managed',
    handler: async (args, ctx) => {
      if (!args.trim()) {ctx.ui.notify(JSON.stringify({override: override ?? 'global/session', config: loadClassifierConfig({cwd: ctx.cwd, agentDir, projectTrusted: false}).config}), 'info'); return;}
      if (args.trim() === 'session') {override = {provider: undefined, model: undefined}; ctx.ui.notify('Bash judge uses session model', 'info'); return;}
      const [provider, ...rest] = args.trim().split('/'), id = rest.join('/');
      if (!ctx.modelRegistry.find(provider, id)) {ctx.ui.notify('Unknown provider/model; nothing changed', 'error'); return;}
      override = {provider, model: id}; ctx.ui.notify(`Bash judge: ${provider}/${id} (session only)`, 'info');
    },
  });
}
