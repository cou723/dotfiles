// Real Pi extension loader and upstream review/parser code; no API calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const root = process.env.REVIEW_ROOT;
const host = join(process.env.PI_PACKAGE_DIR, 'node_modules/@earendil-works');
const { loadExtensions } = await import(pathToFileURL(join(host, 'pi-coding-agent/dist/core/extensions/loader.js')));
const loaded = await loadExtensions([
  join(root, 'extensions/10-permission-system.ts'),
  join(root, 'extensions/15-permission-auto-review.ts'),
], process.cwd());
try {
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 2);
  assert.ok(loaded.extensions[0].handlers.has('tool_call'));
  assert.ok(loaded.extensions[1].handlers.has('session_start'));
  const policy = JSON.parse(readFileSync(process.env.POLICY_CONFIG, 'utf8'));
  assert.deepEqual(policy.authorizerChain, ['auto-review']);
  assert.equal(policy.yoloMode, false);
  assert.equal(policy.permission['*'], 'ask');
  for (const name of ['codemode', 'subagent', 'ask_user_question', 'resolve-library-id', 'query-docs']) {
    assert.equal(policy.permission[name], 'allow');
  }
  for (const surface of ['bash', 'mcp']) assert.equal(policy.permission[surface], 'ask');
  // Skill loading must be allowed before the auto-review authorizer is consulted.
  assert.equal(policy.permission.skill, 'allow');
  for (const surface of ['path', 'external_directory']) assert.equal(policy.permission[surface], 'allow');
  assert.deepEqual(policy.piInfrastructureReadPaths, []);
  const config = JSON.parse(readFileSync(process.env.REVIEW_CONFIG, 'utf8'));
  assert.equal(config.additionalPolicy,
    readFileSync(process.env.REVIEW_POLICY, 'utf8').replace(/\n$/, ''));
  const review = await import(pathToFileURL(join(root, 'node_modules/@mzwing/pi-permission-auto-review/dist/review.js')));
  const args = { command: 'printf safe', timeout: 10 };
  const branch = [{ type: 'message', message: { role: 'assistant', content: [
    { type: 'toolCall', id: 'call-1', name: 'bash', arguments: args },
  ] } }];
  assert.deepEqual(review.findToolCallInput(branch, 'call-1'), args);
  const prompt = review.buildReviewPrompt(config, review.renderTranscript(branch),
    { toolName: 'bash', toolCallId: 'call-1', command: args.command }, args);
  assert.ok(prompt.systemPrompt.includes(config.additionalPolicy));
  assert.equal(config.includeBaselinePolicy, false);
  assert.ok(prompt.userPrompt.includes('"timeout": 10'));
  // UI suggestions must not look like already granted session permissions.
  // Keep the gated unit and the actual complete tool input separately intact.
  const fullCommand = 'git diff --check; git add example; git commit -m example';
  const suggestionPrompt = review.buildReviewPrompt(config, review.renderTranscript(branch), {
    toolName: 'bash', command: 'git diff --check',
    sessionLabel: 'git diff *',
    sessionApproval: { grants: [{ surface: 'bash', pattern: 'git diff *' }] },
  }, { command: fullCommand });
  const requestText = suggestionPrompt.userPrompt.split('>>> PERMISSION REQUEST START\n')[1]
    .split('\n>>> PERMISSION REQUEST END')[0];
  const request = JSON.parse(requestText);
  assert.equal(Object.hasOwn(request, 'sessionLabel'), false);
  assert.equal(Object.hasOwn(request, 'sessionApproval'), false);
  assert.equal(request.command, 'git diff --check');
  assert.equal(request.toolInput.command, fullCommand);
  assert.ok(!requestText.includes('git diff *'));
  for (const outcome of ['allow', 'deny']) {
    assert.equal(review.parseReviewAssessment(JSON.stringify({
      risk_level: 'low', user_authorization: 'high', outcome, rationale: 'test',
    })).outcome, outcome);
  }
  assert.throws(() => review.parseReviewAssessment('not JSON'));
  for (const outcome of ['ask', 'defer', true, false]) {
    assert.throws(() => review.parseReviewAssessment(JSON.stringify({ outcome })),
      'AI verdicts are allow/deny only; defer is an extension fallback');
  }
  // Ensure both published WASM files work without native node-gyp bindings.
  const require = createRequire(join(root, 'node_modules/@gotgenes/pi-permission-system/package.json'));
  const { Parser, Language } = await import(pathToFileURL(require.resolve('web-tree-sitter')));
  await Parser.init({ locateFile: () => require.resolve('web-tree-sitter/web-tree-sitter.wasm') });
  const parser = new Parser();
  parser.setLanguage(await Language.load(require.resolve('tree-sitter-bash/tree-sitter-bash.wasm')));
  const tree = parser.parse('printf safe && git status');
  assert.equal(tree.rootNode.hasError, false);
  tree.delete();
  parser.delete();
  console.log('PASS: real Pi loader, permission/reviewer hooks, routing config, editable policy, complete direct-call args, session suggestions omitted, allow/deny/malformed verdicts, Bash WASM. No API calls.');
} finally {
  loaded.runtime.invalidate();
}
