import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {inside, canonical, filesystemDecision, literalRm, normalize, validateConfig, capabilityDecision} from './policy.mjs';
import {sandboxOperations} from './sandbox.mjs';

import {fixture} from '../tests/helpers.mjs';
const root = fixture('capability-test-');
const cwd = path.join(root, 'project'), scratch = path.join(root, 'scratch');
fs.mkdirSync(cwd); fs.mkdirSync(scratch);
const agentDir = path.join(root, 'agent'), sourceDir = path.join(cwd, 'dot_pi');
fs.mkdirSync(agentDir); fs.mkdirSync(sourceDir);
const decide = (inputPath, operation = 'delete', owned) => filesystemDecision({inputPath, operation, cwd, agentDir, protectedRoots: [sourceDir], scratch, owned});
const config = {version: 1, servers: {github:'github', slack:'slack', backlog:'backlog'}, githubGrants: [], slackGrants: []};

test('path component boundaries', () => {assert.equal(inside('/tmp/pi','/tmp/pi-other/a'), false); assert.equal(inside('/tmp/pi','/tmp/pi/a'), true);});
test('filesystem root containment is not confused with a double slash', () => assert.equal(inside(path.parse(cwd).root,cwd),true));
for (const p of ['/', '/tmp/pi', cwd, scratch]) test(`deny deleting root ${p}`, () => assert.equal(decide(p).state, 'deny'));
test('allow scratch child cleanup', () => assert.equal(decide(path.join(scratch,'build')).state, 'allow'));
test('workspace cleanup requires human', () => assert.equal(decide(path.join(cwd,'build')).state, 'ask'));
test('other tasks cannot be deleted', () => assert.equal(decide('/tmp/pi/other-task/build').state, 'deny'));
test('new shared document allowed', () => assert.equal(decide(path.join(root,'new.md'),'write').state, 'allow'));
test('existing shared document asks; ownership allows', () => {const p=path.join(root,'old.md');fs.writeFileSync(p,'old');assert.equal(decide(p,'write').state,'ask');assert.equal(decide(p,'write',new Set([p])).state,'allow');});
test('symlink escape denied, including nonexistent child', () => {const p=path.join(root,'escape');fs.symlinkSync('/etc',p);assert.equal(decide(path.join(p,'new'),'write').state,'deny');});
test('parent traversal cannot grant deletion', () => assert.equal(decide(path.join(scratch,'../../other'),'delete').state,'deny'));
test('policy source immutable', () => assert.equal(decide(path.join(sourceDir,'settings.json'),'write').state,'deny'));
test('file URL is not silently misinterpreted', () => assert.throws(() => decide('file:///tmp/pi/a','write')));
test('literal rm accepts recursive and -- forms', () => {assert.deepEqual(literalRm('rm -rf -- ./build'),['./build']);assert.deepEqual(literalRm("rm -r 'build output'"),['build output']);});
for (const command of ['rm -rf "$DIR"','rm -rf /tmp/pi/*','rm -rf ./a && echo yes','rm -rf $(pwd)','rm --no-preserve-root /']) test(`reject nonliteral/unknown rm: ${command}`, () => assert.throws(() => literalRm(command)));
test('read-only normalization is explicit', () => {assert.equal(normalize('github','issue_read',{method:'get'}).action,'read');assert.equal(normalize('backlog','add_issue_comment',{}).action,'unknown.write');});
test('invalid config/grant fails closed', () => {assert.throws(()=>validateConfig({...config,githubGrants:[{repo:'x/y',kind:'issue',relation:'modelSaysSo'}]}));assert.throws(()=>validateConfig({}));});
test('Backlog always requires human', async () => assert.equal(await capabilityDecision(normalize('backlog','add_issue_comment',{}),config,()=>{throw Error('unexpected')}),'ask'));
test('GitHub checks Issue/PR kind and authenticated assignee', async () => {
  const op=normalize('github','add_issue_comment',{owner:'org',repo:'repo',issue_number:1,body:'test'});
  const c={...config,githubGrants:[{repo:'org/repo',kind:'issue',relation:'assignee'}]};
  const facts=async (_d,p)=>p==='/user'?{login:'me'}:{assignees:[{login:'me'}],user:{login:'other'}};
  assert.equal(await capabilityDecision(op,c,facts),'allow');
  assert.equal(await capabilityDecision(op,c,async(d,p)=>({...await facts(d,p),pull_request:{}})),'ask');
  assert.equal(await capabilityDecision(op,c,async(_d,p)=>p==='/user'?{login:'me'}:{assignees:[],assignedToMe:true}),'ask');
});
test('Slack requires workspace, thread mention evidence', async () => {
  const op=normalize('slack','slack_send_message',{channel_id:'C123',thread_ts:'123.456',text:'reply'});
  const c={...config,slackGrants:[{workspace:'T123',channel:'C123',mentionedOnly:true}]};
  const facts=async(_d,p)=>p==='auth.test'?{ok:true,team_id:'T123',user_id:'U123'}:{ok:true,messages:[{text:'hi <@U123>'}]};
  assert.equal(await capabilityDecision(op,c,facts),'allow');
  assert.equal(await capabilityDecision({...op,payload:{...op.payload,reply_broadcast:true}},c,facts),'ask');
  await assert.rejects(()=>capabilityDecision(op,c,async(d,p)=>({...await facts(d,p),has_more:true})));
  assert.equal(await capabilityDecision(normalize('slack','slack_send_message',{channel_id:'C123',text:'new post'}),c,facts),'ask');
});
test('bwrap contains writes, secrets, network, policy and other task scratch', async () => {
  const outside=path.join(root,'outside.txt'), immutable=path.join(sourceDir,'config.json');
  fs.writeFileSync(outside,'preserve');fs.writeFileSync(immutable,'immutable');
  const ops=sandboxOperations(scratch,{agentDir,protectedRoots:[sourceDir]});
  let output='';const run=command=>ops.exec(command,cwd,{onData:b=>output+=b.toString(),timeout:10,env:{...process.env,GITHUB_MCP_TOKEN:'test-secret'}});
  assert.equal((await run('echo success > build.txt')).exitCode,0);
  assert.equal(fs.readFileSync(path.join(cwd,'build.txt'),'utf8').trim(),'success');
  assert.notEqual((await run(`echo bad > '${outside}'`)).exitCode,0);
  assert.notEqual((await run(`echo bad > '${immutable}'`)).exitCode,0);
  assert.equal((await run('test -z "$GITHUB_MCP_TOKEN"')).exitCode,0);
  assert.equal((await run('echo scratch > "$TMPDIR/log"')).exitCode,0);
  assert.equal(fs.readFileSync(outside,'utf8'),'preserve');
  assert.equal(fs.readFileSync(immutable,'utf8'),'immutable');
});

test.after(() => {fs.rmSync(root,{recursive:true,force:true});});
