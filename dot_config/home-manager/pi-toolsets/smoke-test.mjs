import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const roots = process.argv.slice(2);
assert.equal(roots.length, 9);
const agentDir = mkdtempSync(join(tmpdir(), 'pi-toolsets-'));
for (const kind of ['skills', 'extensions', 'prompts', 'themes']) mkdirSync(join(agentDir, kind));
const names = new Set();
const destinations = new Set();
for (const root of roots) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json')));
  const metadata = JSON.parse(readFileSync(join(root, 'toolset.json')));
  assert.equal(manifest.name, metadata.name);
  assert(!names.has(manifest.name));
  names.add(manifest.name);
  for (const [kind, paths] of Object.entries(metadata.resources)) {
    assert.deepEqual(manifest.pi[kind], paths.map(p => './' + kind + '/' + p));
    for (const path of paths) {
      const key = kind + '/' + path;
      assert(!destinations.has(key), key);
      destinations.add(key);
      assert(existsSync(join(root, key)), key);
      symlinkSync(join(root, key), join(agentDir, key));
    }
  }
}
const { loadSkills } = await import(pathToFileURL(join(process.env.PI_PACKAGE_DIR,
  'node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js')));
const result = loadSkills({ cwd: agentDir, agentDir, skillPaths: [], includeDefaults: true });
assert.deepEqual(result.skills.map(s => s.name).sort(), [
  'context7-docs', 'd2-diagram', 'd2-slides', 'explainer', 'explainer-book',
  'first-reader', 'pi-nix-toolsets', 'todoist', 'yomiyasu'
]);
assert.equal(result.diagnostics.filter(d => d.type === 'collision').length, 0);
for (const skill of result.skills) assert(skill.description);
assert(existsSync(join(agentDir, 'skills/explainer-book/../explainer/scripts/verify-doc.mjs')));
assert(existsSync(join(agentDir, 'skills/pi-nix-toolsets/references/toolsets.md')));
console.log(JSON.stringify(result.diagnostics));
console.log('Nine toolsets: manifests, Home Manager layout, nine skills and sibling references verified.');
