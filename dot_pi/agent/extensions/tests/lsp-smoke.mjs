import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sdk, fixture, agentDir} from './helpers.mjs';
const {DefaultResourceLoader, createAgentSession, SessionManager} = await sdk();
const cwd = fixture('lsp-sdk-test-');
fs.mkdirSync(path.join(cwd, '.git'));
fs.writeFileSync(path.join(cwd, 'package.json'), '{"private":true}');
fs.writeFileSync(path.join(cwd, 'tsconfig.json'), '{"compilerOptions":{"strict":true,"noEmit":true},"include":["*.ts"]}');
let ctx;
const resourceLoader = new DefaultResourceLoader({cwd, agentDir: agentDir(), extensionFactories: [pi => {
 pi.registerTool({name:'lsp_test_probe', label:'Probe', description:'Local test', parameters:{type:'object',properties:{}}, execute:async(_id,_params,_signal,_update,context)=>{ctx=context;return {content:[{type:'text',text:'ok'}]};}});
}]});
await resourceLoader.reload();
console.log('extension errors:', JSON.stringify(resourceLoader.getExtensions().errors));
assert.equal(resourceLoader.getExtensions().errors.length, 0);
const {session} = await createAgentSession({cwd, resourceLoader, sessionManager:SessionManager.inMemory()});
await session.bindExtensions({});
try {
 const names=session.getAllTools().map(t=>t.name);
 console.log('active tools:', session.getActiveToolNames().join(', '));
 for(const n of ['lsp_diagnostics','lsp_hover','lsp_definition','lsp_references','lsp_symbols']) assert(names.includes(n));
 await session.agent.state.tools.find(t=>t.name==='lsp_test_probe').execute('probe',{});
 session.agent.state.messages.push({role:'assistant',content:[{type:'toolCall',id:'probe',name:'lsp_test_probe',arguments:{}}],api:'openai-responses',provider:'openai',model:'test-fixture',stopReason:'toolUse',timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}});
 const probeMessage=session.agent.state.messages.at(-1);
 const invoke=async(name,args)=>{session.agent.state.messages.push(probeMessage);const r=await ctx.executeTool(name,args);assert(!r.isError,JSON.stringify(r));const text=r.result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');console.log(name,JSON.stringify(text));return text;};
 const file=path.join(cwd,'sample.ts');
 fs.writeFileSync(file,'export const count: number = "wrong";\nexport const next = count + 1;\n');
 assert.match(await invoke('lsp_diagnostics',{path:file}),/not assignable/);
 assert.match(await invoke('lsp_hover',{path:file,line:0,character:14}),/number/);
 assert.match(await invoke('lsp_definition',{path:file,line:1,character:21}),/sample\.ts/);
 assert.match(await invoke('lsp_references',{path:file,line:0,character:14,includeDeclaration:true}),/sample\.ts/);
 assert.match(await invoke('lsp_symbols',{path:file}),/count/);
 const written=await invoke('write',{path:path.join(cwd,'written.ts'),content:'export const bad: number = "wrong";\n'});
 assert.match(written,/not assignable/);
 for(const [name,ext,source,pattern] of [
  ['JSON','json','{"bad": }',/Value expected|Expected/i],
  ['YAML','yaml','hello: one\nhello: two\n',/duplicate|unique/i],
  ['Python','py','answer: int = "wrong"\n',/cannot be assigned|not assignable/i],
  ['C++','cpp','int main() { return "wrong"; }\n',/cannot initialize|cannot convert|incompatible/i],
 ]) {
   const p=path.join(cwd,`invalid.${ext}`);fs.writeFileSync(p,source);
   assert.match(await invoke('lsp_diagnostics',{path:p}),pattern);console.log(name,'real diagnostics passed');
 }
 const blocked=await ctx.executeTool('write',{path:path.join(agentDir(),'lsp.json'),content:'{}'});assert(blocked.isError);
 const secret=path.join(cwd,'.env');fs.writeFileSync(secret,'SECRET=fixture');
 assert((await ctx.executeTool('lsp_diagnostics',{path:secret})).isError);
 // Unknown project command must not run in noninteractive mode.
 fs.mkdirSync(path.join(cwd,'.pi'));
 const marker=path.join(cwd,'must-not-run');
 fs.writeFileSync(path.join(cwd,'.pi/lsp.json'),JSON.stringify({version:1,servers:[{id:'malicious',bin:'sh',args:['-c',`touch ${marker}`],include:['**/*.ts']}]}));
 await invoke('lsp_symbols',{path:file});assert(!fs.existsSync(marker));
 console.log('LSP tests passed: real servers, nested tool gate, automatic write diagnostics, project trust rejection; no model calls.');
} finally {
 await session._extensionRunner?.emit({type:'session_shutdown',reason:'quit'});session.dispose();fs.rmSync(cwd,{recursive:true,force:true});
}
