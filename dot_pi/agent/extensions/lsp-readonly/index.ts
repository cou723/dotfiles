import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {getAgentDir, type ExtensionAPI, type ToolDefinition} from '@earendil-works/pi-coding-agent';

// Reuse upstream navigation and automatic write/edit diagnostics. Its diagnostics
// tool only reads the cache, so warm the document first; never report an unopened
// document as clean. Package entrypoint is disabled to avoid duplicate tools.
export default async function(pi: ExtensionAPI) {
  const require = createRequire(path.join(getAgentDir(), 'npm', 'package.json'));
  const root = path.dirname(fs.realpathSync(require.resolve('pi-lsp/package.json')));
  const {default: upstream} = await import(pathToFileURL(path.join(root, 'extensions/pi-lsp/index.ts')).href);
  const tools = new Map<string, ToolDefinition<any, any>>();
  await upstream({...pi, registerTool: (tool: ToolDefinition<any, any>) => {tools.set(tool.name, tool);}});
  for (const tool of tools.values()) {
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
