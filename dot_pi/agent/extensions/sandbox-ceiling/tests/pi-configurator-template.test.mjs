import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sourceAgentDir = fileURLToPath(new URL("../../../", import.meta.url));
const template = readFileSync(new URL("../../../agents/pi-configurator.md.tmpl", import.meta.url), "utf8");
const result = spawnSync(process.env.CHEZMOI_BIN ?? "chezmoi", [
  "--config", "/dev/null", "--config-format", "toml", "--source", sourceAgentDir,
  "execute-template",
], { input: template, encoding: "utf8", timeout: 10000 });
assert.equal(result.status, 0, String(result.error ?? result.stderr));
const roots = key => JSON.parse(result.stdout.match(new RegExp("^  " + key + ": (\\[.*\\])$", "m"))[1]);
assert.deepEqual(roots("read"), [
  "${cwd}", sourceAgentDir.replace(/\/$/, ""), "${home}/.pi/agent",
  "${home}/.local/share/pnpm/store/v11/links/@earendil-works",
  "${home}/.config/gh/config.yml", "${home}/.config/gh/hosts.yml",
]);
assert.deepEqual(roots("write"), ["${cwd}", sourceAgentDir.replace(/\/$/, "") + "/dot_pi/agent"]);
assert.match(result.stdout, /"gh auth \*": deny\n    "gh auth status": allow/);

if (process.env.POC_MODULES && process.env.POC_JITI_ENTRY) {
  const { createJiti } = await import(process.env.POC_JITI_ENTRY);
  const jiti = createJiti(import.meta.url, { tryNative: false });
  const base = process.env.POC_MODULES + "/@gotgenes/pi-permission-system/src/";
  const { extractFrontmatter, parseSimpleYamlMap } = await jiti.import(base + "config/yaml-frontmatter.ts");
  const { compileWildcardPatternEntries, findCompiledWildcardMatch } = await jiti.import(base + "policy/wildcard-matcher.ts");
  const policy = parseSimpleYamlMap(extractFrontmatter(result.stdout)).permission;
  const patterns = compileWildcardPatternEntries(Object.entries(policy.bash));
  assert.equal(findCompiledWildcardMatch(patterns, "gh auth status").state, "allow");
  for (const command of ["gh auth token", "gh auth status --show-token", "gh auth login", "gh auth logout", "gh auth refresh", "gh auth switch", "gh auth setup-git"]) {
    assert.equal(findCompiledWildcardMatch(patterns, command).state, "deny", command);
  }
}
console.log("PASS: pi-configurator exposes only two gh configuration files read-only, preserves write roots, permits status and denies auth changes/token output");
