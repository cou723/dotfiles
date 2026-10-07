import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from '../tests/helpers.mjs';
import {loadRuntime,loadGrants,packageRoot} from './runtime.mjs';
import {filesystemDecision,validateConfig,canonical,inside} from './policy.mjs';
import {sandboxOperations} from './sandbox.mjs';
const root=fixture('runtime-test-');
const agentDir=path.join(root,'custom-agent'), cwd=path.join(root,'workspace'), scratch=path.join(root,'scratch');
for(const d of [agentDir,cwd,scratch]) fs.mkdirSync(d,{mode:0o700});
const runtimeFile=path.join(agentDir,'resource-capability-runtime.json');
const config={version:1,protectedRoots:[],lspServers:{custom:{command:['{node}','--version']}}};
fs.writeFileSync(runtimeFile,JSON.stringify(config));
fs.writeFileSync(path.join(agentDir,'resource-capability-gate.json'),JSON.stringify({version:1,servers:{},githubGrants:[],slackGrants:[]}));
after(()=>fs.rmSync(root,{recursive:true,force:true}));

test('global runtime and grants ignore project settings',()=>{
 fs.mkdirSync(path.join(cwd,'.pi'));
 fs.writeFileSync(path.join(cwd,'.pi/resource-capability-runtime.json'),JSON.stringify({version:999}));
 fs.writeFileSync(path.join(cwd,'.pi/resource-capability-gate.json'),JSON.stringify({version:999}));
 assert.equal(loadRuntime(agentDir).lspServers.custom[0],process.execPath);
 assert.deepEqual(loadGrants(agentDir,validateConfig).githubGrants,[]);
});
test('loaded package is automatically immutable without personal source-root settings',()=>{
 const boundary=loadRuntime(agentDir);
 assert(boundary.protectedRoots.includes(canonical(packageRoot)));
 assert.equal(filesystemDecision({...boundary,inputPath:path.join(packageRoot,'resource-capability-gate/runtime.mjs'),operation:'write',cwd,scratch}).state,'deny');
});
test('runtime/grant symlink targets outside agent directory remain immutable',()=>{
 const external=path.join(root,'external-grants.json');
 fs.writeFileSync(external,'{}');
 const link=path.join(agentDir,'resource-capability-gate.json');fs.unlinkSync(link);fs.symlinkSync(external,link);
 for(const inputPath of [link,external]) assert.equal(filesystemDecision({...loadRuntime(agentDir),inputPath,operation:'write',cwd,scratch}).state,'deny');
});
test('missing or malformed runtime fails closed',()=>{
 fs.writeFileSync(runtimeFile,'{}');assert.throws(()=>loadRuntime(agentDir));
 fs.writeFileSync(runtimeFile,JSON.stringify({...config,protectedRoots:['relative/path']}));assert.throws(()=>loadRuntime(agentDir));
 fs.writeFileSync(runtimeFile,JSON.stringify({...config,lspServers:{bad:{command:'sh -c x'}}}));assert.throws(()=>loadRuntime(agentDir));
 fs.unlinkSync(runtimeFile);assert.throws(()=>loadRuntime(agentDir));
 fs.writeFileSync(runtimeFile,JSON.stringify(config));
});
test('credential file symlink target is masked inside bash sandbox',async()=>{
 const credential=path.join(root,'external-auth.json');fs.writeFileSync(credential,'fixture-secret');
 fs.symlinkSync(credential,path.join(agentDir,'auth.json'));
 let output='';const ops=sandboxOperations(scratch,loadRuntime(agentDir));
 const r=await ops.exec(`test ! -s '${credential}' && printf masked`,cwd,{onData:b=>output+=b.toString(),timeout:10});
 assert.equal(r.exitCode,0,output);assert.equal(output,'masked');assert.equal(fs.readFileSync(credential,'utf8'),'fixture-secret');
});
