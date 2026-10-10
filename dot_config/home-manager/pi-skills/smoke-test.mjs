import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { loadSkills } = await import(pathToFileURL(
  join(process.env.PI_PACKAGE_DIR, 'node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js')
));
const agentDir = mkdtempSync(join(tmpdir(), 'pi-skills-'));
mkdirSync(join(agentDir, 'skills'));
const expected = ['d2-diagram', 'd2-slides', 'explainer', 'explainer-book', 'first-reader', 'yomiyasu'];
for (const name of expected) {
  symlinkSync(join(process.env.SKILLS_ROOT, name), join(agentDir, 'skills', name));
}
const result = loadSkills({ cwd: agentDir, agentDir, skillPaths: [], includeDefaults: true });
assert.deepEqual(result.skills.map(s => s.name).sort(), expected);
assert.equal(result.diagnostics.filter(d => d.type === 'collision').length, 0);
for (const skill of result.skills) assert.ok(skill.description);
for (const path of ['yomiyasu/scripts/yomiyasu_lint.py', 'yomiyasu/references/slop-catalog.md',
  'explainer/scripts/verify-doc.mjs', 'explainer/references/figures.md',
  'first-reader/scripts/skim.py', 'd2-slides/assets/build-deck.mjs']) {
  assert.ok(existsSync(join(process.env.SKILLS_ROOT, path)), path);
}
// Report upstream metadata warnings without silently changing upstream instructions.
console.log(JSON.stringify(result.diagnostics));
console.log('All six skills discovered through Home Manager-style symlinks.');
