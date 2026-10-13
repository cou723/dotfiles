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

export const reminder = `コミット方針のリマインド（このリポジトリの試験運用）:
ユーザーは作業完了まで待たず、小さな変更単位で頻繁にコミットすることを希望しています。途中状態のチェックポイントコミットも許容しています。
未コミット差分が変化しました。次の編集や完了報告の前に差分を確認し、この作業で自分が変更した部分だけをコミットしてください。
作業開始前の変更、他のセッションの変更、秘密情報・認証情報・生成ログは含めないでください。git add -A で無条件に全部を取り込まないでください。push はしないでください。
安全にコミットできない場合は、無理にコミットせず理由を報告してください。フックは変更の所有者を判定していません。`;

export class ReminderState {
  last = null;
  pending = false;
  requested = false;
  initialize(fingerprint) { this.last = fingerprint; this.pending = false; }
  start() { this.requested = false; }
  observe(fingerprint) {
    if (fingerprint === null) return false;
    if (!fingerprint) { this.last = ""; this.pending = false; return false; }
    if (fingerprint === this.last) return false;
    this.last = fingerprint;
    this.pending = true;
    return true;
  }
  settle(canContinue) {
    if (!canContinue || !this.pending || this.requested) return false;
    this.requested = true;
    this.pending = false;
    return true;
  }
}
