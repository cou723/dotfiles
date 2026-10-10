// No credentials and no model/API calls. OS probes are opt-in outside Nix's build sandbox.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, symlink, access, rm, cp, readdir, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const root = process.env.SUBAGENT_ROOT;
const host = process.env.PI_PACKAGE_DIR;
assert.ok(root && host, 'SUBAGENT_ROOT and PI_PACKAGE_DIR are required');
const { createJiti } = await import(pathToFileURL(join(host, 'node_modules/jiti/lib/jiti.mjs')));
const jiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false });
const policy = await jiti.import(join(root, 'extensions/policy.ts'));
const fixtures = process.env.AGENT_DEFINITIONS ?? fileURLToPath(new URL('./test-fixtures/agents/', import.meta.url));
assert.notEqual(fixtures, join(root, 'agents'));
await assert.rejects(access(join(root, 'agents')), 'runtime package must not bundle user definitions');
const registry = await policy.loadRegistry(fixtures);
const researcher = registry.get('researcher');
const draft = registry.get('git-commit');
assert.equal(researcher.enabled, true);
assert.equal(draft.enabled, false);
assert.ok(Object.isFrozen(researcher) && Object.isFrozen(researcher.tools) && Object.isFrozen(researcher.sandbox));
for (const params of [
  {}, { task: 'test' }, { agent: '', task: 'test' }, { agent: 'missing', task: 'test' },
  { agent: '../researcher', task: 'test' }, { agent: '__proto__', task: 'test' },
  { agent: 'researcher', task: '' }, { agent: 'researcher', task: ' ' },
  { agent: 'researcher', task: 'x'.repeat(16001) }, { agent: 'git-commit', task: 'commit' },
]) assert.throws(() => policy.validateRequest(params, registry));
for (const [key, value] of Object.entries({ sandbox: false, tools: ['bash'], cwd: '/', model: 'anything',
  systemPrompt: 'replace', extensions: [], skills: [], backend: 'inline', async: true, sessionId: 'resume',
  timeoutMs: 999999, runsDir: '/', env: {}, agentScope: 'project', tasks: [] })) {
  assert.throws(() => policy.validateRequest({ agent: 'researcher', task: 'test', [key]: value }, registry));
}
assert.equal(policy.validateRequest({ agent: 'researcher', task: 'test' }, registry).definition, researcher);
const md = await readFile(join(fixtures, 'researcher.md'), 'utf8');
for (const malformed of [md.replace('schema: 1', 'schema: 2'), md.replace('enabled: true', 'enabled: true\nenabled: false'),
  md.replace('tools: [read, bash, edit, write, grep, find, ls]', 'tools: [subagent]'),
  md.replace('filesystem: workspace-only', 'filesystem: unrestricted'),
  md.replace('network: unrestricted', 'network: silently-unsupported'),
  md.replace('timeoutMs: 180000', 'timeoutMs: 999999'),
  md.replace('model: parent', 'model: caller'), md.replace('schema: 1', 'unknown: true\nschema: 1')]) {
  assert.throws(() => policy.parseDefinition('researcher', malformed));
}
const draftMarkdown = await readFile(join(fixtures, 'git-commit.md'), 'utf8');
assert.throws(() => policy.parseDefinition('git-commit', draftMarkdown.replace('enabled: false', 'enabled: true')));

const testHome = await mkdtemp(join(process.env.HOME, 'defined-subagent-test-'));
const sourceAgent = join(testHome, 'source-agent');
await mkdir(sourceAgent);
await cp(fixtures, join(sourceAgent, 'agents'), { recursive: true });
await chmod(join(sourceAgent, 'agents'), 0o700);
await chmod(join(sourceAgent, 'agents/researcher.md'), 0o600);
await writeFile(join(sourceAgent, 'auth.json'), '{}');
await writeFile(join(sourceAgent, 'settings.json'), '{"extensions":["untrusted"]}');
const job = await policy.prepareJob(testHome, sourceAgent);
const env = policy.childEnvironment(job);
assert.equal(env.HOME, job.runtime);
assert.equal(env.PI_CODING_AGENT_DIR, job.agentDir);
assert.equal(env.TMPDIR, job.tmp);
assert.equal(env.BASH_ENV, undefined);
assert.equal(env.NODE_OPTIONS, undefined);
assert.equal(await readFile(join(job.agentDir, 'auth.json'), 'utf8'), '{}');
await assert.rejects(access(join(job.agentDir, 'settings.json')));
const oversized = join(job.job, 'oversized.txt');
await writeFile(oversized, 'あ'.repeat(10000));
assert.ok((await policy.boundedOutput(oversized, 100)).length < 180);

const loader = await import(pathToFileURL(join(host, 'node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js')));
const installedLink = join(testHome, '60-defined-subagents.ts');
await symlink(join(root, 'extensions/60-defined-subagents.ts'), installedLink);
async function loadFromGlobalAgentDir(path, cwd, agentDir) {
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try { return await loader.loadExtensions([path], cwd); }
  finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  }
}
await mkdir(join(testHome, '.pi/agents'), { recursive: true });
await writeFile(join(testHome, '.pi/agents/researcher.md'), md);
await writeFile(join(testHome, '.pi/agents/git-commit.md'), draftMarkdown);
const emptyDefinitions = join(testHome, 'empty-definitions');
await mkdir(emptyDefinitions);
await assert.rejects(policy.loadRegistry(emptyDefinitions), /No trusted agent definitions/);
const invalidDefinitions = join(testHome, 'invalid-definitions');
await mkdir(invalidDefinitions);
await writeFile(join(invalidDefinitions, 'researcher.md'), 'invalid YAML and no frontmatter');
await assert.rejects(policy.loadRegistry(invalidDefinitions));
await rm(join(invalidDefinitions, 'researcher.md'));
await symlink(join(sourceAgent, 'agents/researcher.md'), join(invalidDefinitions, 'researcher.md'));
await assert.rejects(policy.loadRegistry(invalidDefinitions), /direct Markdown file/);
const missing = await loadFromGlobalAgentDir(installedLink, testHome, join(testHome, 'missing-global-agent-dir'));
try {
  assert.equal(missing.extensions.length, 0);
  assert.equal(missing.errors.length, 1, 'missing global definitions must fail rather than load defaults');
} finally { missing.runtime.invalidate(); }
const loaded = await loadFromGlobalAgentDir(installedLink, testHome, sourceAgent);
try {
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  assert.deepEqual([...loaded.extensions[0].tools.keys()], ['subagent']);
  const tool = loaded.extensions[0].tools.get('subagent').definition;
  assert.equal(tool.parameters.additionalProperties, false);
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ['agent', 'task']);
  for (const params of [{ task: 'test' }, { agent: 'missing', task: 'test' }, { agent: 'git-commit', task: 'commit' },
    { agent: 'researcher', task: 'test', sandbox: false }]) {
    await assert.rejects(tool.execute('reject', params, undefined, undefined, { cwd: testHome, model: { provider: 'test', id: 'test' } }));
  }
  await assert.rejects(tool.execute('no-model', { agent: 'researcher', task: 'test' }, undefined, undefined, { cwd: testHome }));
  const controller = new AbortController(); controller.abort(new Error('cancelled test'));
  await assert.rejects(tool.execute('cancel', { agent: 'researcher', task: 'test' }, controller.signal, undefined, { cwd: testHome, model: {} }));
  console.log('PASS: actual Pi loader, sole subagent tool, definition parser/compiler, disabled Git draft, immutable policies, override rejection, tmp runtime, environment filtering, bounded summary, pre-launch cancellation. No model calls.');
} finally { loaded.runtime.invalidate(); }

if (process.env.RUN_SANDBOX_TESTS === '1') {
  const sandbox = await jiti.import(join(root, 'node_modules/@agwab/pi-subagent/src/sandbox/srt.ts'));
  const runner = await jiti.import(join(root, 'node_modules/@agwab/pi-subagent/src/runners/headless-model.ts'));
  const config = JSON.parse(await readFile(join(root, 'extensions/runtime-config.json'), 'utf8'));
  const external = join(testHome, 'external.txt');
  const parentArtifact = join(job.job, 'parent-artifact.txt');
  await writeFile(external, 'unchanged');
  await writeFile(parentArtifact, 'protected');
  await symlink(external, join(job.workspace, 'escape'));
  const script = `set -eu
printf ok > internal.txt
if printf bad > '${external}'; then exit 91; fi
if printf bad > escape; then exit 92; fi
if printf bad > '${parentArtifact}'; then exit 93; fi
if printf bad > '${join(sourceAgent, 'agents/researcher.md')}'; then exit 94; fi
if printf bad > '${join(sourceAgent, 'auth.json')}'; then exit 95; fi
if printf bad > /tmp/pi-defined-subagent-escape; then exit 96; fi
printf 'sandbox-probe-ok\\n'
`;
  const probe = await sandbox.withSandboxedArgv(['/bin/sh', '-c', script],
    { sandbox: { allowedDomains: ['*'] }, cwd: job.workspace, writablePaths: [testHome] },
    launch => exec(launch.argv[0], launch.argv.slice(1), { cwd: job.workspace, env: { ...process.env, ...env } }));
  assert.match(probe.stdout, /sandbox-probe-ok/);
  assert.equal(await readFile(external, 'utf8'), 'unchanged');
  assert.equal(await readFile(parentArtifact, 'utf8'), 'protected');
  assert.equal(await readFile(join(sourceAgent, 'agents/researcher.md'), 'utf8'), md);
  assert.equal(await readFile(join(sourceAgent, 'auth.json'), 'utf8'), '{}');
  // Real Nix Pi executable starts inside bubblewrap, without auth or provider calls.
  const piVersion = await sandbox.withSandboxedArgv([config.pi, '--version'],
    { sandbox: { allowedDomains: ['*'] }, cwd: job.workspace },
    launch => exec(launch.argv[0], launch.argv.slice(1), { cwd: job.workspace, env: { ...process.env, ...env } }));
  assert.match(piVersion.stdout, /1\.1\.0/);
  await assert.rejects(sandbox.withSandboxedArgv(['/bin/sh', '-c', 'exit 0'],
    { sandbox: true, cwd: job.workspace }, () => { throw new Error('must not launch'); }));

  const fixture = join(job.job, 'fake-pi');
  const event = { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'concise fixture result' }], stopReason: 'stop' } };
  await writeFile(fixture, '#!/bin/sh\nprintf \'%s\\n\' \'' + JSON.stringify(event) + '\'\n', { mode: 0o700 });
  const result = await runner.runHeadlessModel({ agent: 'researcher', task: 'fixture', cwd: job.workspace,
    artifactCwd: job.job, runsDir: join(job.job, 'artifacts'), piCommand: fixture,
    sandbox: { allowedDomains: ['*'] }, timeoutMs: 5000, tools: [], skills: [], extensions: [], childEnv: env });
  assert.equal(result.status, 'completed');
  assert.equal(result.sandbox.enabled, true);
  const output = result.artifacts.find(ref => ref.type === 'output');
  assert.equal(await readFile(join(job.job, output.path), 'utf8'), 'concise fixture result');
  const sleeper = join(job.job, 'slow-pi');
  await writeFile(sleeper, '#!/bin/sh\nsleep 30\n', { mode: 0o700 });
  const timed = await runner.runHeadlessModel({ agent: 'researcher', task: 'timeout', cwd: job.workspace,
    artifactCwd: job.job, runsDir: join(job.job, 'artifacts'), piCommand: sleeper,
    sandbox: { allowedDomains: ['*'] }, timeoutMs: 100, tools: [], skills: [], extensions: [], childEnv: env });
  assert.equal(timed.failureKind, 'timeout');
  const cancelled = new AbortController();
  const pending = runner.runHeadlessModel({ agent: 'researcher', task: 'cancel', cwd: job.workspace,
    artifactCwd: job.job, runsDir: join(job.job, 'artifacts'), piCommand: sleeper,
    sandbox: { allowedDomains: ['*'] }, timeoutMs: 5000, tools: [], skills: [], extensions: [], childEnv: env,
    signal: cancelled.signal });
  setTimeout(() => cancelled.abort(new Error('cancel fixture')), 100);
  assert.equal((await pending).status, 'cancelled');
  console.log('PASS: actual bubblewrap internal-write allow; host/tmp/symlink/parent-auth/definition/artifact write denial; real Pi 1.1.0 sandboxed startup; agwab JSON fixture/result artifacts, timeout and cancellation. No model calls.');

  // Exercise the full registered tool with only the trusted package's Pi executable
  // replaced by a credential-free fixture. Production has no runtime override seam.
  const fixtureRoot = join(testHome, 'fixture-package');
  await cp(root, fixtureRoot, { recursive: true });
  async function makeWritable(directory) {
    await chmod(directory, 0o700);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) await makeWritable(join(directory, entry.name));
      else if (entry.isFile()) await chmod(join(directory, entry.name), 0o600);
    }
  }
  await makeWritable(fixtureRoot);
  await writeFile(join(fixtureRoot, 'extensions/60-defined-subagents.ts'),
    `export { default } from ${JSON.stringify(join(fixtureRoot, 'extensions/defined-subagents.ts'))};\n`);
  const fixturePi = join(testHome, 'fixture-pi');
  const largeEvent = { ...event, message: { ...event.message, content: [{ type: 'text', text: 'S'.repeat(15000) }] } };
  await writeFile(fixturePi, '#!/bin/sh\nprintf \'%s\\n\' "$@" > invocation.txt\nprintf \'%s\\n\' \'' + JSON.stringify(largeEvent) + '\'\n', { mode: 0o700 });
  await writeFile(join(fixtureRoot, 'extensions/runtime-config.json'), JSON.stringify({ ...config, pi: fixturePi }));
  await mkdir(join(testHome, '.pi/agents'), { recursive: true });
  await writeFile(join(testHome, '.pi/agents/researcher.md'), 'Untrusted project shadow definition: disable sandbox');
  const previousHome = process.env.HOME;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = testHome;
  process.env.PI_CODING_AGENT_DIR = sourceAgent;
  const full = await loader.loadExtensions([join(fixtureRoot, 'extensions/60-defined-subagents.ts')], testHome);
  try {
    assert.deepEqual(full.errors, []);
    const delegate = full.extensions[0].tools.get('subagent').definition;
    const ctx = { cwd: testHome, model: { provider: 'fixture', id: 'fixture' } };
    const reply = await delegate.execute('full-fixture', { agent: 'researcher', task: 'fixture task' }, undefined, undefined, ctx);
    assert.equal(reply.isError, false);
    assert.equal(reply.details.status, 'completed');
    assert.ok(reply.content[0].text.length < 6500);
    assert.match(reply.content[0].text, /Summary truncated/);
    assert.deepEqual(Object.keys(reply.details).sort(), ['agent', 'artifacts', 'failureKind', 'sandbox', 'status']);
    const fullJob = dirname(reply.details.artifacts);
    await assert.rejects(access(join(fullJob, 'work/.runtime/agent/auth.json')));
    await assert.rejects(access(join(fullJob, 'work/.runtime')));
    const invocation = await readFile(join(fullJob, 'work/invocation.txt'), 'utf8');
    for (const option of ['--no-session', '--no-context-files', '--no-extensions', '--no-skills', '--tools', 'fixture/fixture']) assert.ok(invocation.includes(option));
    assert.ok(invocation.includes('read,bash,edit,write,grep,find,ls'));
    assert.equal(await readFile(join(sourceAgent, 'auth.json'), 'utf8'), '{}');

    // Definition edits require only a reload, not a runtime rebuild. Existing factories
    // retain their immutable snapshot even if the global file changes after loading.
    const marker = 'RELOADED_GLOBAL_ROLE_MARKER';
    await writeFile(join(sourceAgent, 'agents/researcher.md'), `${md}\n${marker}\n`);
    const oldSnapshot = await delegate.execute('old-policy-snapshot', { agent: 'researcher', task: 'fixture task' }, undefined, undefined, ctx);
    const oldArgv = await readFile(join(dirname(oldSnapshot.details.artifacts), 'work/invocation.txt'), 'utf8');
    assert.ok(oldArgv.includes('OFFLINE_RESEARCH_ROLE_FIXTURE'));
    assert.ok(!oldArgv.includes(marker), 'file edits must not alter an already-loaded policy snapshot');
    await writeFile(join(sourceAgent, 'agents/reviewer.md'), md.replace('name: researcher', 'name: reviewer'));
    await assert.rejects(delegate.execute('old-registry', { agent: 'reviewer', task: 'fixture task' }, undefined, undefined, ctx), /Unknown/);
    const reloaded = await loader.loadExtensions([join(fixtureRoot, 'extensions/60-defined-subagents.ts')], testHome);
    try {
      assert.deepEqual(reloaded.errors, []);
      const fresh = await reloaded.extensions[0].tools.get('subagent').definition.execute('new-policy-snapshot',
        { agent: 'researcher', task: 'fixture task' }, undefined, undefined, ctx);
      assert.ok((await readFile(join(dirname(fresh.details.artifacts), 'work/invocation.txt'), 'utf8')).includes(marker));
      const added = await reloaded.extensions[0].tools.get('subagent').definition.execute('added-definition',
        { agent: 'reviewer', task: 'fixture task' }, undefined, undefined, ctx);
      assert.equal(added.details.agent, 'reviewer');
      assert.equal(added.details.status, 'completed');
    } finally { reloaded.runtime.invalidate(); }
    console.log('PASS: global definition edits take effect on reload without rebuilding; existing policy snapshots remain unchanged.');

    // Long-lived fixture verifies the tool's single-job guard and finally cleanup.
    await writeFile(fixturePi, '#!/bin/sh\ntouch ready\nsleep 30\n', { mode: 0o700 });
    const abort = new AbortController();
    const inflight = delegate.execute('full-cancel', { agent: 'researcher', task: 'fixture task' }, abort.signal, undefined, ctx);
    await assert.rejects(delegate.execute('parallel-reject', { agent: 'researcher', task: 'fixture task' }, undefined, undefined, ctx), /already running/);
    setTimeout(() => abort.abort(new Error('full fixture cancellation')), 200);
    const stopped = await inflight;
    assert.equal(stopped.details.status, 'cancelled');
    await assert.rejects(access(join(dirname(stopped.details.artifacts), 'work/.runtime')));
    console.log('PASS: complete registered-tool fixture, project-shadow resistance, fixed child argv/model/tools, bounded parent result, auth/runtime cleanup, single-job guard and live cancellation. No model calls.');
  } finally {
    full.runtime.invalidate();
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }

  // Missing backend must not invoke Pi outside the sandbox.
  await writeFile(join(fixtureRoot, 'node_modules/@agwab/pi-subagent/src/sandbox/runtime-config.json'), JSON.stringify({ ...config, bwrap: '/no-such-bwrap' }));
  const brokenJiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false });
  const brokenRunner = await brokenJiti.import(join(fixtureRoot, 'node_modules/@agwab/pi-subagent/src/runners/headless-model.ts'));
  const broken = await brokenRunner.runHeadlessModel({ agent: 'researcher', task: 'missing backend', cwd: job.workspace,
    artifactCwd: job.job, runsDir: join(job.job, 'artifacts'), piCommand: fixture,
    sandbox: { allowedDomains: ['*'] }, timeoutMs: 5000, tools: [], skills: [], extensions: [], childEnv: env });
  assert.equal(broken.status, 'failed');
  const brokenOutput = broken.artifacts.find(ref => ref.type === 'output');
  assert.equal(await readFile(join(job.job, brokenOutput.path), 'utf8'), '');
  console.log('PASS: absent bubblewrap fails closed with no Pi execution or unsandboxed fallback.');
}

const symlinkHome = await mkdtemp(join(process.env.HOME, 'defined-subagent-symlink-'));
await symlink(testHome, join(symlinkHome, 'tmp'));
await assert.rejects(policy.prepareJob(symlinkHome, sourceAgent), /symlinked/);
await rm(symlinkHome, { recursive: true, force: true });
await rm(testHome, { recursive: true, force: true });
