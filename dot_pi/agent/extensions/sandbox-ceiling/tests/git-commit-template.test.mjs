import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sourceAgentDir = fileURLToPath(new URL("../../../", import.meta.url));
const template = readFileSync(
  new URL("../../../agents/git-commit.md.tmpl", import.meta.url),
  "utf8",
);
const args = ["--config", "/dev/null", "--config-format", "toml", "--source", sourceAgentDir];
/** @type {import("node:child_process").SpawnSyncOptionsWithStringEncoding} */
const options = { encoding: "utf8", timeout: 10000 };
const lookup = spawnSync(
  process.env.CHEZMOI_BIN ?? "chezmoi",
  [...args, "execute-template", '{{ lookPath "chezmoi" }}'],
  options,
);
assert.equal(lookup.status, 0, String(lookup.error ?? lookup.stderr));
const executable = process.env.CHEZMOI_BIN ?? lookup.stdout.trim();
assert.ok(executable);
const windowsApps = '/mnt/d/Users/Another "User"/AppData/Local/Microsoft/WindowsApps';
/** @param {string} osrelease @param {string} PATH @param {string} [os] */
function render(osrelease, PATH, os = "linux") {
  return spawnSync(
    executable,
    [
      ...args,
      "--override-data",
      JSON.stringify({ chezmoi: { os, kernel: { osrelease } } }),
      "execute-template",
    ],
    {
      ...options,
      input: template,
      env: { ...process.env, PATH },
    },
  );
}
/** @param {import("node:child_process").SpawnSyncReturns<string>} result @param {string} [mode] */
function roots(result, mode = "read") {
  assert.equal(result.status, 0, String(result.error ?? result.stderr));
  assert.ok(result.stdout.startsWith("---\n"), "Frontmatter must start at the first byte");
  const match = result.stdout.match(new RegExp("^  " + mode + ": (\\[.*\\])$", "m"));
  assert.ok(match);
  return JSON.parse(match[1]);
}
const wsl = render(
  "6.18-microsoft-standard-WSL2",
  `/usr/bin:${windowsApps}/:/another/AppData/Local/Microsoft/WindowsApps`,
);
assert.deepEqual(roots(wsl), [
  "${cwd}",
  "${home}/.local/share/chezmoi",
  "${home}/.gitconfig",
  "/init",
  "/run/WSL",
  windowsApps + "/op-ssh-sign-wsl.exe",
]);
assert.deepEqual(roots(wsl, "write"), ["${cwd}", "${home}/.local/share/chezmoi"]);
assert.ok(wsl.stdout.includes("対象リポジトリは起動元のカレントディレクトリ"));
assert.ok(wsl.stdout.includes("各 bash 呼び出しに `cd` を挟まない"));
assert.ok(wsl.stdout.includes("git rev-parse --show-toplevel"));
assert.ok(wsl.stdout.includes("別リポジトリへ移動せず停止"));
assert.ok(wsl.stdout.includes("説明と大きく異なる"));
assert.ok(wsl.stdout.includes("無関係な未ステージ変更があるだけでは停止せず"));
assert.ok(!wsl.stdout.includes("cd <対象リポジトリ> &&"));
assert.ok(wsl.stdout.includes("実パスが対象リポジトリの書き込み許可範囲"));
assert.match(wsl.stdout, /"git ls-files\*": allow/);
assert.match(wsl.stdout, /"git config \*":\n {6}action: deny\n {6}reason: ".+"/);
assert.ok(!wsl.stdout.includes('"git config --list*": allow'));
assert.match(wsl.stdout, /"git rev-parse\*": allow/);
assert.match(wsl.stdout, /"git add -- \*": allow/);
assert.match(wsl.stdout, /"git commit \*": allow/);
assert.match(wsl.stdout, /"git commit \*--amend\*":\n {6}action: deny\n {6}reason: ".+"/);
assert.ok(wsl.stdout.includes('mktemp -d "$git_dir/pi-signing.XXXXXXXX"'));
assert.ok(wsl.stdout.includes('TMPDIR="$signing_tmp" git commit'));
assert.ok(wsl.stdout.includes("0700"));
assert.ok(wsl.stdout.includes("成否を問わず"));
assert.match(wsl.stdout, /"git push\*":\n {6}action: deny\n {6}reason: ".+"/);
assert.match(wsl.stdout, /"\*": ask/);
assert.ok(!wsl.stdout.includes("805_interop"));
for (const result of [
  render("6.18-generic", "/usr/bin"),
  render("microsoft", "/usr/bin", "darwin"),
]) {
  assert.deepEqual(roots(result), ["${cwd}", "${home}/.local/share/chezmoi", "${home}/.gitconfig"]);
  assert.deepEqual(roots(result, "write"), ["${cwd}", "${home}/.local/share/chezmoi"]);
}
for (const PATH of [
  "/usr/bin",
  "relative/AppData/Local/Microsoft/WindowsApps",
  "/tmp/WindowsApps",
]) {
  const missing = render("microsoft-standard-WSL2", PATH);
  assert.equal(missing.error, undefined);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /WSL signing requires a WindowsApps directory in PATH/);
}
console.log(
  "PASS: WSL-only minimal read grants, dynamic Windows username/drive, quoted paths, first PATH match, runtime home, cwd and chezmoi-only writes, unattended commit grants and missing-path rejection",
);

// Exercise the installed parser and rule matcher rather than a replacement shell policy.
if (process.env.POC_MODULES && process.env.POC_JITI_ENTRY) {
  const { createJiti } = await import(process.env.POC_JITI_ENTRY);
  const jiti = createJiti(import.meta.url, { tryNative: false });
  const base = process.env.POC_MODULES + "/@gotgenes/pi-permission-system/src/";
  const { extractFrontmatter, parseSimpleYamlMap } = await jiti.import(
    base + "config/yaml-frontmatter.ts",
  );
  const { compileWildcardPatternEntries, findCompiledWildcardMatch } = await jiti.import(
    base + "policy/wildcard-matcher.ts",
  );
  const { getParser } = await jiti.import(base + "access-intent/bash/parser.ts");
  const { collectCommands } = await jiti.import(base + "access-intent/bash/command-enumeration.ts");
  const { WordReader } = await jiti.import(base + "access-intent/bash/node-text.ts");
  const { ShellVariables } = await jiti.import(
    base + "access-intent/bash/shell-variable-expansion.ts",
  );
  const { resolveBashCommandCheck } = await jiti.import(base + "handlers/gates/bash-command.ts");
  const policy = parseSimpleYamlMap(extractFrontmatter(wsl.stdout)).permission;
  const globalPolicy = JSON.parse(
    readFileSync(new URL("../../pi-permission-system/config.json", import.meta.url), "utf8"),
  ).permission;
  const patterns = compileWildcardPatternEntries(
    Object.entries({ ...globalPolicy.bash, ...policy.bash }),
  );
  const resolver = {
    resolve: /** @param {{input: {command: string}}} request */ (request) => {
      const { input } = request;
      const match = findCompiledWildcardMatch(patterns, input.command);
      return {
        state: typeof match?.state === "object" ? match.state.action : (match?.state ?? "ask"),
        toolName: "bash",
        source: "bash",
        origin: "agent",
        matchedPattern: match?.matchedPattern,
        command: input.command,
      };
    },
  };
  const parser = await getParser();
  /** @param {string} command @param {"allow" | "ask" | "deny"} expected */
  function check(command, expected) {
    const tree = parser.parse(command);
    assert.ok(tree, "Installed bash parser must parse the command");
    try {
      const units = collectCommands(
        tree.rootNode,
        new WordReader(ShellVariables.scan([tree.rootNode])),
      );
      const result = resolveBashCommandCheck(command, units, "git-commit", resolver);
      assert.equal(result.state, expected, JSON.stringify({ command, units, result }));
    } finally {
      tree.delete();
    }
  }
  for (const command of [
    "git add -- src/example.ts",
    "git show --stat --oneline HEAD",
    'test -S "$WSL_INTEROP"',
    "git_dir=$(git rev-parse --absolute-git-dir)",
    'git_dir=$(realpath "$git_dir")',
    'umask 077; signing_tmp=$(mktemp -d "$git_dir/pi-signing.XXXXXXXX")',
    'chmod 700 "$signing_tmp"',
    'TMPDIR="$signing_tmp" git commit -m "Explain why"; commit_status=$?',
    'test -n "$signing_tmp" && rm -f -- "$signing_tmp"/* && rmdir -- "$signing_tmp"',
    'test "$commit_status" -eq 0 || exit "$commit_status"',
  ])
    check(command, "allow");
  for (const command of [
    "git push",
    "git commit --amend -m x",
    "git commit --no-verify -m x",
    "git commit --no-gpg-sign -m x",
    "git commit -a -m x",
    "git reset --hard",
    "git restore file.txt",
    "git clean -fd",
    "git config user.name changed",
    "git -c commit.gpgsign=false commit -m x",
    "git status && git push",
  ])
    check(command, "deny");
  for (const command of [
    "git add .",
    "rm -rf .git",
    "env TMPDIR=/tmp git commit -m x",
    "sh -c 'git commit -m x'",
  ])
    check(command, "ask");
  console.log(
    "PASS: installed permission-system parser/matcher allows direct signing workflow, denies destructive Git operations, retains asks for wrappers and broad staging/deletion",
  );
}
