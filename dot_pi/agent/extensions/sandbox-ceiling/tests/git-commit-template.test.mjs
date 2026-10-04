import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sourceAgentDir = fileURLToPath(new URL("../../../", import.meta.url));
const template = readFileSync(new URL("../../../agents/git-commit.md.tmpl", import.meta.url), "utf8");
const args = ["--config", "/dev/null", "--config-format", "toml", "--source", sourceAgentDir];
const options = { encoding: "utf8", timeout: 10000 };
const lookup = spawnSync(process.env.CHEZMOI_BIN ?? "chezmoi", [...args, "execute-template", '{{ lookPath "chezmoi" }}'], options);
assert.equal(lookup.status, 0, String(lookup.error ?? lookup.stderr));
const executable = process.env.CHEZMOI_BIN ?? lookup.stdout.trim();
assert.ok(executable);
const windowsApps = '/mnt/d/Users/Another "User"/AppData/Local/Microsoft/WindowsApps';
function render(osrelease, PATH, os = "linux") {
  return spawnSync(executable, [...args, "--override-data", JSON.stringify({ chezmoi: { os, kernel: { osrelease } } }), "execute-template"], {
    ...options, input: template, env: { ...process.env, PATH },
  });
}
function roots(result, mode = "read") {
  assert.equal(result.status, 0, String(result.error ?? result.stderr));
  assert.ok(result.stdout.startsWith("---\n"), "Frontmatter must start at the first byte");
  const match = result.stdout.match(new RegExp("^  " + mode + ": (\\[.*\\])$", "m"));
  assert.ok(match);
  return JSON.parse(match[1]);
}
const wsl = render("6.18-microsoft-standard-WSL2", `/usr/bin:${windowsApps}/:/another/AppData/Local/Microsoft/WindowsApps`);
assert.deepEqual(roots(wsl), ["${cwd}", "${home}/.gitconfig", "/init", "/run/WSL", windowsApps + "/op-ssh-sign-wsl.exe"]);
assert.deepEqual(roots(wsl, "write"), ["${cwd}"]);
assert.match(wsl.stdout, /"git ls-files\*": allow/);
assert.match(wsl.stdout, /"git config --list\*": allow/);
assert.match(wsl.stdout, /"git rev-parse --absolute-git-dir": allow/);
assert.ok(wsl.stdout.includes('mktemp -d "$git_dir/pi-signing.XXXXXXXX"'));
assert.ok(wsl.stdout.includes('TMPDIR="$signing_tmp" git commit'));
assert.ok(wsl.stdout.includes("0700"));
assert.ok(wsl.stdout.includes("成否を問わず"));
assert.match(wsl.stdout, /"git push\*": deny/);
assert.match(wsl.stdout, /"\*": ask/);
assert.ok(!wsl.stdout.includes("805_interop"));
assert.deepEqual(roots(render("6.18-generic", "/usr/bin")), ["${cwd}", "${home}/.gitconfig"]);
assert.deepEqual(roots(render("microsoft", "/usr/bin", "darwin")), ["${cwd}", "${home}/.gitconfig"]);
for (const PATH of ["/usr/bin", "relative/AppData/Local/Microsoft/WindowsApps", "/tmp/WindowsApps"]) {
  const missing = render("microsoft-standard-WSL2", PATH);
  assert.equal(missing.error, undefined);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /WSL signing requires a WindowsApps directory in PATH/);
}
console.log("PASS: WSL-only minimal read grants, dynamic Windows username/drive, quoted paths, first PATH match, runtime home, cwd-only writes, preserved permissions and missing-path rejection");
