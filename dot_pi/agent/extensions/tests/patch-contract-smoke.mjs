import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {sdk,fixture,agentDir} from './helpers.mjs';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const realAgent=agentDir(), previous=process.env.PI_CODING_AGENT_DIR;
const require=createRequire(path.join(realAgent,'npm/package.json'));
const lspRoot=path.dirname(fs.realpathSync(require.resolve('pi-lsp/package.json')));
const permissionRoot=path.dirname(path.dirname(fs.realpathSync(require.resolve('@gotgenes/pi-permission-system'))));
const root=fixture('missing-patch-');
const {DefaultResourceLoader}=await sdk();
try{
 for(const missing of ['lsp','permissions']){
  const profile=path.join(root,missing), modules=path.join(profile,'npm/node_modules');
  fs.mkdirSync(path.join(modules,'@gotgenes'),{recursive:true});
  fs.writeFileSync(path.join(profile,'npm/package.json'),'{"private":true}');
  fs.cpSync(lspRoot,path.join(modules,'pi-lsp'),{recursive:true});
  fs.symlinkSync(path.dirname(lspRoot),path.join(modules,'pi-lsp/node_modules'),'dir');
  fs.cpSync(permissionRoot,path.join(modules,'@gotgenes/pi-permission-system'),{recursive:true});
  const marker=missing==='lsp'?path.join(modules,'pi-lsp/extensions/pi-lsp/index.ts'):path.join(modules,'@gotgenes/pi-permission-system/src/access-intent/tool-input-path.ts');
  fs.writeFileSync(marker,fs.readFileSync(marker,'utf8').replace(/export const (?:DIAGNOSTICS_CACHE_VERSION|TOOL_ACCESS_FACTS_VERSION) = \d+;/,''));
  fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({extensions:[path.join(source,'lsp-readonly/index.ts')]}));
  process.env.PI_CODING_AGENT_DIR=profile;
  const loader=new DefaultResourceLoader({cwd:root,agentDir:profile});await loader.reload();
  assert(loader.getExtensions().errors.some(e=>JSON.stringify(e).includes('patches are missing')),JSON.stringify(loader.getExtensions().errors));
  assert(!loader.getExtensions().extensions.some(e=>e.tools.has('lsp_diagnostics')));
 }
 console.log('Missing either required patch: explicit load error; LSP tools not registered');
}finally{
 if(previous===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previous;
 fs.rmSync(root,{recursive:true,force:true});
}
