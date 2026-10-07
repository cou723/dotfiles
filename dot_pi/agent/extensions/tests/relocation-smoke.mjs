import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sdk,fixture,agentDir,probeMessage} from './helpers.mjs';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const realAgent=agentDir();
const originalEnv=process.env.PI_CODING_AGENT_DIR;
const root=fixture('relocation-'), cwd=path.join(root,'workspace'), profile=path.join(root,'profile');
const moved=path.join(cwd,'vendor','independent-package'), alias=path.join(profile,'extensions','installed-package');
const protectedProbe=path.join(moved,'source-probe.ts');
fs.mkdirSync(moved,{recursive:true});fs.mkdirSync(path.dirname(alias),{recursive:true});
for(const name of ['resource-capability-gate','bash-classifier','lsp-readonly']) fs.cpSync(path.join(source,name),path.join(moved,name),{recursive:true});
// Explicit entries exercise symlinked loading; a minimal manifest avoids auto
// discovering the same entries a second time from this test-only directory.
fs.writeFileSync(path.join(moved,'package.json'),'{"type":"module"}');
fs.symlinkSync(moved,alias,'dir');
fs.symlinkSync(path.join(realAgent,'npm'),path.join(profile,'npm'),'dir');
const permissionDir=path.join(profile,'extensions','pi-permission-system');fs.mkdirSync(permissionDir);
// Deliberately permissive ordinary policy: the independent immutable-root Gate
// and OS sandbox, not old chezmoi path rules, must protect the relocated code.
fs.writeFileSync(path.join(permissionDir,'config.json'),JSON.stringify({permission:{'*':'allow',path:'allow',path_write:{'*':'allow',[protectedProbe]:'deny'},external_directory_read:'allow',external_directory_write:'allow',bash:'allow',mcp:'allow'},authorizerChain:['resource-tool-gate','bash-classifier']}));
const classifierDir=path.join(profile,'extensions','pi-permission-classifier');fs.mkdirSync(classifierDir);
fs.copyFileSync(path.join(realAgent,'extensions/pi-permission-classifier/config.json'),path.join(classifierDir,'config.json'));
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({packages:['npm:@gotgenes/pi-permission-system@40.0.0'],extensions:['resource-capability-gate','bash-classifier','lsp-readonly'].map(n=>path.join(alias,n,'index.ts'))}));
fs.writeFileSync(path.join(profile,'mcp.json'),'{"mcpServers":{}}');
const runtime=JSON.parse(fs.readFileSync(path.join(realAgent,'resource-capability-runtime.json'),'utf8'));
const assets=path.join(cwd,'tooling','language-assets');fs.mkdirSync(path.dirname(assets));
const originalTs=runtime.lspServers.typescript.command[1];
const assetRoot=originalTs.slice(0,originalTs.indexOf('/node_modules/'));
fs.symlinkSync(assetRoot,assets,'dir');
fs.writeFileSync(path.join(profile,'resource-capability-runtime.json'),JSON.stringify({version:1,protectedRoots:[assets],lspServers:{typescript:{command:['{node}',path.join(assets,'node_modules/typescript-language-server/lib/cli.mjs'),'--stdio']}}}));
fs.writeFileSync(path.join(profile,'resource-capability-gate.json'),JSON.stringify({version:1,servers:{backlog:'backlog'},githubGrants:[],slackGrants:[]}));
fs.writeFileSync(path.join(profile,'lsp.json'),JSON.stringify({version:1,servers:[{id:'relocated-ts',bin:process.execPath,args:[path.join(alias,'resource-capability-gate/lsp-server.mjs'),profile,'typescript'],include:['**/*.ts'],rootMarkers:['package.json'],cwd:'{root}',languageIdByExtension:{'.ts':'typescript'},initializationOptions:{disableAutomaticTypingAcquisition:true,tsserver:{path:path.join(assets,'node_modules/typescript/lib/tsserver.js')}}}]}));
fs.writeFileSync(path.join(cwd,'package.json'),'{"private":true}');
fs.mkdirSync(path.join(cwd,'.pi'));fs.writeFileSync(path.join(cwd,'.pi/resource-capability-runtime.json'),'{"version":999}');
const outsideAuth=path.join(root,'external-auth.json');fs.writeFileSync(outsideAuth,JSON.stringify({'fixture-provider':{type:'api_key',key:'fixture-secret'}}));fs.symlinkSync(outsideAuth,path.join(profile,'auth.json'));
process.env.PI_CODING_AGENT_DIR=profile;
const {DefaultResourceLoader,createAgentSession,SessionManager}=await sdk();
let ctx,backend=0;
const loader=new DefaultResourceLoader({cwd,agentDir:profile,extensionFactories:[pi=>{
 pi.registerTool({name:'relocation_probe',label:'Probe',description:'Local fixture',parameters:{type:'object',properties:{}},execute:async(_id,_p,_s,_u,c)=>{ctx=c;return {content:[{type:'text',text:'ok'}]};}});
 pi.registerTool({name:'fixture_writer',label:'Writer',description:'Local fake writer',parameters:{type:'object',properties:{path:{type:'string'}}},execute:async()=>{backend++;return {content:[{type:'text',text:'must not run'}]};}});
 pi.registerTool({name:'mcp__backlog__add_issue_comment',label:'Mock Backlog',description:'Never posts',parameters:{type:'object',properties:{}},execute:async()=>{backend++;return {content:[{type:'text',text:'must not run'}]};}});
}]});
let session;
try {
 await loader.reload();assert.deepEqual(loader.getExtensions().errors,[]);console.log('relocated extension errors: []');
 ({session}=await createAgentSession({cwd,resourceLoader:loader,sessionManager:SessionManager.inMemory()}));await session.bindExtensions({});
 await session.agent.state.tools.find(t=>t.name==='relocation_probe').execute('probe',{});
 const invoke=async(name,args)=>{session.agent.state.messages.push(probeMessage('relocation_probe'));return ctx.executeTool(name,args);};
 const target=path.join(moved,'resource-capability-gate/runtime.mjs'), before=fs.readFileSync(target,'utf8');
 for(const name of ['write','fixture_writer']) for(const p of [target,path.join(alias,'resource-capability-gate/runtime.mjs')]) {
   const r=await invoke(name,{path:p,content:'bad'});assert(r.isError,JSON.stringify(r));assert.match(JSON.stringify(r.result),/resource-capability/);
 }
 for(const p of ['resource-capability-runtime.json','resource-capability-gate.json']) assert((await invoke('write',{path:path.join(profile,p),content:'{}'})).isError);
 const shellWrite=await invoke('bash',{command:`echo bad > '${target}'`});
 assert(shellWrite.isError);assert.match(JSON.stringify(shellWrite.result),/Read-only file system|Permission denied/);
 assert.equal(fs.readFileSync(target,'utf8'),before);
 const creds=await invoke('bash',{command:`test ! -s '${outsideAuth}'`});assert(!creds.isError,JSON.stringify(creds));
 assert((await invoke('mcp__backlog__add_issue_comment',{})).isError);assert.equal(backend,0);
 fs.writeFileSync(protectedProbe,'export const protectedValue: number = 42;\n');
 const sourceHover=await invoke('lsp_hover',{path:protectedProbe,line:0,character:14});assert(!sourceHover.isError,JSON.stringify(sourceHover));assert.match(JSON.stringify(sourceHover.result),/number/);
 const sourceDiag=await invoke('lsp_diagnostics',{path:protectedProbe});assert(!sourceDiag.isError,JSON.stringify(sourceDiag));assert.match(JSON.stringify(sourceDiag.result),/relocated-ts: no diagnostics/);
 assert((await invoke('write',{path:protectedProbe,content:'bad'})).isError);
 const ts=path.join(cwd,'sample.ts');fs.writeFileSync(ts,'export const bad: number = "wrong";\n');
 const diagnostics=await invoke('lsp_diagnostics',{path:ts});assert(!diagnostics.isError,JSON.stringify(diagnostics));assert.match(JSON.stringify(diagnostics.result),/not assignable/);
 console.log('relocated + symlinked package: direct/custom tool writes denied, bash writes denied, credentials masked, Backlog blocked, configured relocated LSP assets return real diagnostics');
 // Even if personal runtime config disappears, calls do not run ungated.
 fs.unlinkSync(path.join(profile,'resource-capability-runtime.json'));
 const ordinary=path.join(cwd,'must-not-create');assert((await invoke('write',{path:ordinary,content:'bad'})).isError);assert(!fs.existsSync(ordinary));
 console.log('missing runtime config fails closed; no model calls or service writes');
} finally {
 if(session){await session._extensionRunner?.emit({type:'session_shutdown',reason:'quit'});session.dispose();}
 if(originalEnv===undefined) delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=originalEnv;
 fs.rmSync(root,{recursive:true,force:true});
}
