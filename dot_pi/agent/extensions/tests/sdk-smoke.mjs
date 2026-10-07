import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sdk, fixture, agentDir} from './helpers.mjs';
const {DefaultResourceLoader,createAgentSession,SessionManager,createCodemodeExtension,createToolSearchExtension,createMcpExtension}=await sdk();
const cwd=fixture('sdk-capability-test-');
let sessionContext, probeContext;
let backendCalls=0;
const resourceLoader=new DefaultResourceLoader({cwd,agentDir:agentDir(),extensionFactories:[
 createCodemodeExtension(),createToolSearchExtension(),createMcpExtension(),
 pi=>{
   pi.on('session_start',(_e,ctx)=>{sessionContext=ctx;});
   pi.registerTool({name:'capability_test_probe',label:'Probe',description:'Local test probe',parameters:{type:'object',properties:{},additionalProperties:false},execute:async(_id,_params,_signal,_update,ctx)=>{probeContext=ctx;return {content:[{type:'text',text:'ok'}],details:undefined};}});
   pi.registerTool({name:'mcp__github__get_me',label:'Mock GitHub read',description:'Mock read-only backend',parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({content:[{type:'text',text:'mock read'}],details:undefined})});
   pi.registerTool({name:'mcp__backlog__add_issue_comment',label:'Mock Backlog',description:'Mock backend; never performs network writes',parameters:{type:'object',properties:{body:{type:'string'}},additionalProperties:true},execute:async()=>{backendCalls++;return {content:[{type:'text',text:'mock'}],details:undefined};}});
 }
]});
await resourceLoader.reload();
const errors=resourceLoader.getExtensions().errors;
console.log('extension errors:',JSON.stringify(errors));
assert.equal(errors.length,0);
const {session}=await createAgentSession({cwd,resourceLoader,sessionManager:SessionManager.inMemory()});
await session.bindExtensions({});
try {
 console.log('tools:',session.getAllTools().map(t=>t.name).join(', '));
 assert(session.getAllTools().some(t=>t.name==='skill_manage'));
 assert(session.getAllTools().some(t=>t.name==='subagent'));
 assert(resourceLoader.getSkills().skills.some(s=>s.name==='commit-workflow'));
 await session.agent.state.tools.find(t=>t.name==='capability_test_probe').execute('probe',{});
 assert(probeContext);
 session.agent.state.messages.push({role:'assistant',content:[{type:'toolCall',id:'probe',name:'capability_test_probe',arguments:{}}],api:'openai-responses',provider:'openai',model:'test-fixture',stopReason:'toolUse',timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}});
 const invoke=async(name,args)=>{const r=await probeContext.executeTool(name,args); if(r.isError) throw new Error(JSON.stringify(r.result)); return r;};
 const newFile=path.join(cwd,'new.md');
 console.log('first write:', JSON.stringify(await invoke('write',{path:newFile,content:'first'})));
 console.log('second write:', JSON.stringify(await invoke('write',{path:newFile,content:'second'})));
 assert.equal(fs.readFileSync(newFile,'utf8'),'second');
 const existing=path.join(cwd,'existing.md');fs.writeFileSync(existing,'preserve');
 await assert.rejects(()=>invoke('write',{path:existing,content:'bad'}),/承認|blocked/i);
 assert.equal(fs.readFileSync(existing,'utf8'),'preserve');
 await assert.rejects(()=>invoke('write',{path:path.join(agentDir(),'settings.json'),content:'bad'}));
 await assert.rejects(()=>invoke('bash',{command:'npm install'}));
 await assert.rejects(()=>invoke('bash',{command:'rm -rf /'}));
 console.log('read-only MCP:',JSON.stringify(await invoke('mcp__github__get_me',{})));
 await assert.rejects(()=>invoke('mcp__backlog__add_issue_comment',{body:'must not post'}),/resource-capability.*承認/);
 assert.equal(backendCalls,0);
 console.log('nested tool tests: passed; no model calls or service writes');
} finally {
 await session._extensionRunner?.emit({type:'session_shutdown',reason:'quit'});
 session.dispose();
 fs.rmSync(cwd,{recursive:true,force:true});
}
