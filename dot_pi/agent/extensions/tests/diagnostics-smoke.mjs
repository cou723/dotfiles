import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sdk,fixture,agentDir,probeMessage} from './helpers.mjs';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const realAgent=agentDir(), original=process.env.PI_CODING_AGENT_DIR;
const root=fixture('diagnostics-'), cwd=path.join(root,'workspace'), profile=path.join(root,'profile');
const protectedDir=path.join(cwd,'protected'), external=path.join(root,'external');
for(const p of [cwd,protectedDir,external,profile,path.join(profile,'extensions/pi-permission-system')])fs.mkdirSync(p,{recursive:true});
fs.symlinkSync(path.join(realAgent,'npm'),path.join(profile,'npm'),'dir');
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({packages:['npm:@gotgenes/pi-permission-system@40.0.0'],extensions:[path.join(source,'lsp-readonly/index.ts')]}));
fs.writeFileSync(path.join(profile,'extensions/pi-permission-system/config.json'),JSON.stringify({permission:{'*':'allow',path:{'*':'allow','*.env':'deny'},path_write:{[protectedDir+'/*']:'deny',[external+'/*']:'deny'},external_directory_read:'allow',external_directory_write:{'*':'allow',[external+'/*']:'deny'}}}));
fs.writeFileSync(path.join(profile,'resource-capability-runtime.json'),JSON.stringify({version:1,protectedRoots:[protectedDir,external],lspServers:{fixture:{command:[process.execPath,path.join(source,'tests/fake-lsp-server.mjs')]}}}));
fs.writeFileSync(path.join(cwd,'package.json'),'{"private":true}');
fs.writeFileSync(path.join(external,'package.json'),'{"private":true}');
fs.writeFileSync(path.join(profile,'lsp.json'),JSON.stringify({version:1,servers:[{id:'fixture',bin:process.execPath,args:[path.join(source,'resource-capability-gate/lsp-server.mjs'),profile,'fixture'],include:['**/*.ts'],rootMarkers:['package.json'],cwd:'{root}',languageIdByExtension:{'.ts':'typescript'},diagnosticsWaitMs:200}]}));
process.env.PI_CODING_AGENT_DIR=profile;
const {DefaultResourceLoader,createAgentSession,SessionManager}=await sdk();
let ctx,writerCalls=0,session;
const loader=new DefaultResourceLoader({cwd,agentDir:profile,extensionFactories:[pi=>{
 pi.registerTool({name:'diagnostics_probe',label:'Probe',description:'Local fixture',parameters:{type:'object',properties:{}},execute:async(_id,_p,_s,_u,c)=>{ctx=c;return {content:[{type:'text',text:'ok'}]};}});
 pi.registerTool({name:'unknown_writer',label:'Writer',description:'Never runs',annotations:{readOnlyHint:true},parameters:{type:'object',properties:{path:{type:'string'}}},execute:async()=>{writerCalls++;return {content:[{type:'text',text:'must not run'}]};}});
}]});
try{
 await loader.reload();assert.deepEqual(loader.getExtensions().errors,[]);
 ({session}=await createAgentSession({cwd,resourceLoader:loader,sessionManager:SessionManager.inMemory()}));await session.bindExtensions({});
 await session.agent.state.tools.find(t=>t.name==='diagnostics_probe').execute('probe',{});
 const invoke=async(name,args)=>{session.agent.state.messages.push(probeMessage('diagnostics_probe'));return ctx.executeTool(name,args);};
 const text=r=>r.result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
 const run=async(name,args)=>{const r=await invoke(name,args);assert(!r.isError,JSON.stringify(r));return text(r);};
 const file=path.join(protectedDir,'source.ts');fs.writeFileSync(file,'clean');
 assert.match(await run('lsp_diagnostics',{path:file}),/no diagnostics/);
 assert.match(await run('lsp_diagnostics',{path:file}),/no diagnostics/); // unchanged cached empty publication
 for(const name of ['lsp_hover','lsp_definition','lsp_references','lsp_symbols'])await run(name,{path:file,line:0,character:0});
 const outside=path.join(external,'outside.ts');fs.writeFileSync(outside,'clean');
 assert.match(await run('lsp_diagnostics',{path:outside}),/no diagnostics/);
 for(const p of [file,outside])for(const name of ['write','unknown_writer'])assert((await invoke(name,{path:p,content:'bad',direction:'read'})).isError);
 const secret=path.join(cwd,'.env');fs.writeFileSync(secret,'FIXTURE=secret');
 for(const name of ['lsp_diagnostics','lsp_hover','lsp_definition','lsp_references','lsp_symbols'])assert((await invoke(name,{path:secret,line:0,character:0})).isError);
 assert.equal(writerCalls,0);
 fs.writeFileSync(file,'error');assert.match(await run('lsp_diagnostics',{path:file}),/fixture type error/);
 fs.writeFileSync(file,'delay-clean');const start=Date.now();const fixed=await run('lsp_diagnostics',{path:file});
 assert.match(fixed,/no diagnostics/);assert(!fixed.includes('fixture type error'));assert(Date.now()-start>=350);
 fs.writeFileSync(file,'silent');assert.match(await run('lsp_diagnostics',{path:file}),/not published/);
 const auto=await run('write',{path:path.join(cwd,'silent.ts'),content:'silent'});assert.match(auto,/not published/);assert(!auto.includes('no diagnostics'));
 console.log('diagnostics/access facts: clean and unchanged, changed error, cleared error, delayed current publication, stale version rejected, silent server warned, protected LSP reads allowed, writes/secrets denied');
}finally{
 if(session){await session._extensionRunner?.emit({type:'session_shutdown',reason:'quit'});session.dispose();}
 if(original===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=original;
 fs.rmSync(root,{recursive:true,force:true});
}
