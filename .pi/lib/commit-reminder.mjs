import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";

const exec = promisify(execFile);
async function git(cwd, args) {
  const { stdout } = await exec("git", ["-C", cwd, ...args], {
    encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

// Only a fingerprint is retained; file contents are never put in the prompt.
export async function snapshot(cwd, allowedRoot) {
  let root;
  try { root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim(); }
  catch { return null; }
  if (await realpath(root) !== await realpath(allowedRoot)) return null;
  const status = await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!status) return "";
  const hash = createHash("sha256").update(status);
  // Separate diffs also distinguish staged and unstaged versions of a file.
  for (const args of [["diff", "--binary", "--no-ext-diff", "--no-textconv"],
    ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv"]]) {
    hash.update(await git(root, args));
  }
  const untracked = await git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  for (const path of untracked.split("\0").filter(Boolean)) {
    hash.update(await git(root, ["hash-object", "--no-filters", "--", path]));
  }
  return hash.digest("hex");
}

export const reminder = `コミット確認（この依頼では最大1回）:
未コミット差分が変わっています。区切りがよければ差分を確認し、この作業で自分が変更した部分だけを小さな単位でコミットしてください。途中状態のチェックポイントコミットも構いません。
作業開始前の変更、他のセッションの変更、秘密情報・認証情報・生成ログは含めず、git add -A で無条件に全部を取り込まないでください。push はしないでください。フックは変更の所有者を判定していません。
権限拒否などで安全にコミットできない場合は、その旨を一度報告すれば十分です。同じ依頼内での再試行は不要です。`;

export class ReminderState {
  last = null;
  notified = false;
  initialize(fingerprint) { this.last = fingerprint; this.notified = false; }
  // Reset once per prompt, not agent_start: continuations can start another loop.
  start() { this.notified = false; }
  observe(fingerprint) {
    if (fingerprint === null) return false;
    if (fingerprint === this.last) return false;
    this.last = fingerprint;
    if (!fingerprint || this.notified) return false;
    this.notified = true;
    return true;
  }
}
