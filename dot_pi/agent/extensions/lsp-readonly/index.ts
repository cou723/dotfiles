import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {getAgentDir, type ExtensionAPI, type ToolDefinition} from '@earendil-works/pi-coding-agent';

// Reuse pinned, patched upstream code. Access direction is a trusted code fact,
// not an annotation or argument supplied by the model. No policy is weakened.
const READ_ONLY_TOOLS = ['lsp_diagnostics','lsp_hover','lsp_definition','lsp_references','lsp_symbols'];
export default async function(pi: ExtensionAPI) {
  const require = createRequire(path.join(getAgentDir(), 'npm', 'package.json'));
  const root = path.dirname(fs.realpathSync(require.resolve('pi-lsp/package.json')));
  const backend = await import(pathToFileURL(path.join(root, 'extensions/pi-lsp/index.ts')).href);
  const permissionsEntry = require.resolve('@gotgenes/pi-permission-system');
  const permissionsRoot = path.dirname(path.dirname(fs.realpathSync(permissionsEntry)));
  const facts = await import(pathToFileURL(path.join(permissionsRoot, 'src/access-intent/tool-input-path.ts')).href);
  if (backend.DIAGNOSTICS_CACHE_VERSION !== 2 || facts.TOOL_ACCESS_FACTS_VERSION !== 1)
    throw new Error('Required LSP/access-facts pnpm patches are missing; reinstall the pinned peers with managed patches.');
  const {getPermissionsService} = await import(pathToFileURL(permissionsEntry).href);
  const disposers: (() => void)[] = [];
  pi.events.on('permissions:ready', (event: any) => {
    if (disposers.length || !event?.sessionId) return;
    const service = getPermissionsService(event.sessionId);
    if (!service) return;
    for (const name of READ_ONLY_TOOLS)
      disposers.push(service.registerToolAccessExtractor(name, (input: Record<string, unknown>) =>
        typeof input.path === 'string' ? {path: input.path, direction: 'read'} : undefined));
  });
  pi.on('session_shutdown', () => {for (const dispose of disposers.splice(0)) dispose();});
  const tools = new Map<string, ToolDefinition<any, any>>();
  await backend.default({...pi, registerTool: (tool: ToolDefinition<any, any>) => {tools.set(tool.name, tool);}});
  for (const name of READ_ONLY_TOOLS) {
    const original = tools.get(name);
    if (!original) throw new Error(`Missing upstream read-only tool: ${name}`);
    const tool = {...original, annotations: {...original.annotations, readOnlyHint: true}};
    if (tool.name !== 'lsp_diagnostics') {pi.registerTool(tool); continue;}
    pi.registerTool({...tool, description: 'Open/update a document and retrieve LSP diagnostics. Diagnostics are advisory, not a substitute for project checks.',
      async execute(id, params, signal, onUpdate, ctx) {
        if (signal?.aborted) throw new Error('aborted');
        const warm = await tools.get('lsp_symbols')!.execute(id, params, signal, onUpdate, ctx);
        if (warm.content.some((c: any) => c.type === 'text' && c.text.startsWith('No matching LSP server'))) return {...warm, isError: true};
        // Upstream diagnostics arrive through asynchronous publishDiagnostics.
        for (let i = 0; i < 60; i++) {
          if (signal?.aborted) throw new Error('aborted');
          await new Promise(resolve => setTimeout(resolve, 250));
          const result = await tool.execute(id, params, signal, onUpdate, ctx);
          if (!result.content.some((c: any) => c.type === 'text' && c.text.includes('no diagnostics recorded'))) return result;
        }
        return {content: [{type: 'text', text: 'LSP has not published diagnostics for this file yet. Do not treat this as a clean result; run the project typecheck/lint.'}], details: undefined};
      },
    });
  }
}
