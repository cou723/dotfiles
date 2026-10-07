import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {launchPlan} from './lsp-server.mjs';
import {loadRuntime,packageRoot} from './runtime.mjs';
import {sandboxArgs} from './sandbox.mjs';
import {fixture} from '../tests/helpers.mjs';
const root=fixture('lsp-sandbox-test-');
const cwd=path.join(root,'project'), scratch=path.join(root,'scratch');
const agentDir=path.join(root,'agent');
fs.mkdirSync(cwd);fs.mkdirSync(scratch,{mode:0o700});fs.mkdirSync(agentDir);
fs.writeFileSync(path.join(agentDir,'resource-capability-runtime.json'),JSON.stringify({version:1,protectedRoots:[],lspServers:{typescript:{command:[process.execPath,'--version']}}}));
after(()=>fs.rmSync(root,{recursive:true,force:true}));

test('LSP command allowlist rejects arbitrary commands',()=>assert.throws(()=>launchPlan('sh',cwd,scratch,agentDir)));
test('LSP sandbox denies broad workspace roots',()=>assert.throws(()=>launchPlan('typescript',os.homedir(),scratch,agentDir)));
test('LSP allows an immutable source cwd read-only; bash still rejects writable source cwd',()=>{
 const {args}=launchPlan('typescript',packageRoot,scratch,agentDir);
 assert(args.some((v,i)=>v==='--ro-bind'&&args[i+1]===packageRoot&&args[i+2]===packageRoot));
 assert.throws(()=>sandboxArgs(packageRoot,scratch,loadRuntime(agentDir),'pwd'));
});
test('LSP subprocess: sources readonly, scratch writable, credentials masked, network isolated',()=>{
 const {args,env}=launchPlan('typescript',cwd,scratch,agentDir);
 assert(!('NODE_OPTIONS' in env));assert(!('GITHUB_MCP_TOKEN' in env));
 const command=args.indexOf('--')+1;
 const script=`
  const fs=require('fs');
  let denied=false;
  try {fs.writeFileSync(${JSON.stringify(path.join(cwd,'must-not-write'))},'bad');} catch(e) {denied=e.code==='EROFS'||e.code==='EACCES';}
  fs.writeFileSync(${JSON.stringify(path.join(scratch,'allowed'))},'scratch');
  console.log(JSON.stringify({denied,agentMasked:fs.readdirSync(${JSON.stringify(agentDir)}).length===0,net:fs.readlinkSync('/proc/self/ns/net')}));`;
 args.splice(command,args.length-command,process.execPath,'-e',script);
 const result=spawnSync('bwrap',args,{env,encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);
 const report=JSON.parse(result.stdout);
 assert(report.denied);assert(report.agentMasked);
 assert.notEqual(report.net,fs.readlinkSync('/proc/self/ns/net'));
 assert.equal(fs.readFileSync(path.join(scratch,'allowed'),'utf8'),'scratch');
 assert(!fs.existsSync(path.join(cwd,'must-not-write')));
});
