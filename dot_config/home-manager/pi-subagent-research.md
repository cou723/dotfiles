# Pi sub-agent 選定記録

> この初回の暫定比較は、ユーザーが明確にした「定義必須＋定義のsandbox条件を固定」という要件に基づく
> [`pi-subagent-research-v2.md`](./pi-subagent-research-v2.md) で更新済み。
> とくに第一候補、Nix環境のsandbox backend検出、定義なし／未知定義の扱いはv2を参照。

調査日: 2026-10-10。対象: Nix / Home Manager 管理の Pi 1.1.0、Linux / WSL2。
今回は比較・推奨まで。拡張は導入していない。

## ユーザーから確認した要件

- 主目的は親セッションのコンテキスト圧迫を避けること。
- あらかじめ用意した定義に基づいて委譲する。
- `git-commit`: 理想の Git 運用を定義側に置き、手続きの詳細を親に持ち込まない。
- `researcher`: tmp 配下だけ編集を許し、検証・調査の結論を親に返す。
- 比較・推奨を提示し、導入は確認後。

「tmp 配下だけ」は安全側に、指示だけでなく強制する書き込み境界として評価した。
読み取り範囲、ネットワーク範囲、Git 運用の詳細はまだ未決定。

## 暫定結論

**定義ベースの委譲基盤として `pi-subagents` 0.77.0 を第一候補にする。**
カスタム Markdown 定義、fresh コンテキスト、ツール／拡張／スキルの明示選択、
結果の出力制限、エージェント別の background launcher を組み合わせられる。

ただし、インストールだけで `researcher` の tmp-only 制約を満たすわけではない。
`bash` を与えて `cwd` を tmp にするだけでは範囲外への書き込みを防げない。
専用 launcher と OS sandbox の設定・試験を追加する必要がある。
この部分を避けたい場合の第二候補は `pi-better-subagents`。
どの候補も、今回の要件をすべて既定設定で満たすと確認できたものではない。

## 比較

| 候補・確認版 | 定義とコンテキスト | 親への返却 | 書き込み境界・主な難点 | 評価 |
|---|---|---|---|---|
| `pi-subagents` 0.77.0 | カスタム Markdown。fresh/fork 選択。カスタムは狭いシステムプロンプトが既定 | `maxOutput`、file-only、進捗を返さない選択が可能 | OS sandbox は別途 launcher 等が必要。ネイティブ child permissions は bash を制限しない | 第一候補。エージェント別の運用を作りやすいが機能は多い |
| `pi-better-subagents` 0.17.0 | role + named-agent の Markdown。子は明示したプロンプトのみ | 非同期 receipt と結果取得を分離。結果は既定 2048-byte ページ | bwrap 等の task sandbox。定義ファイル自体は権限を付与・強制しない。権限は別の人間設定／起動条件 | 第二候補。sandbox を重視するなら有力 |
| `pi-subagent-manager` 0.20.0 | Markdown type、モデル／ツール指定。子は通常 lexical parent の履歴 snapshot から開始 | 原則 final answer のみ。再開・steer が充実 | ツールポリシーは sandbox ではない。作業領域と OS 権限を共有 | 階層的・継続的な共同作業向け。今回の fresh specialist 用途では優先度低 |
| `@agwab/pi-subagent` 0.6.4 | global/project の Markdown agent、ツール上限 | 独立 run と artifact、sync/async | sandbox は明示 opt-in。sandbox の network は deny-all または domain allowlist。open-ended research に制約 | 小さめの実行基盤だが今回の自由調査には設定負担 |
| `@bytetrue/pi-subagent` 0.16.0 | Markdown role、独立 session、軽量な schema | 完了時に結果を follow-up message として返す | OS sandbox は確認できない。bash を持つ「read-only」role は強制的 read-only ではない | 軽量さ優先なら有力。tmp-only を満たすには別途仕組みが必要 |
| `pi-subagent-feather` 0.2.0 | 独立 session と resume | 既定 8 KiB / 200 行の有界結果 | 公開 README / schema で named-agent 定義選択を確認できない | 出力圧縮には合うが定義ベース要件に弱い |

## 第一候補での構成案（未実装）

### 親側

- 親にはエージェント名と短い担当説明だけ知らせる。
- 委譲時は対象 repo、対象ファイル、目的、完了条件だけ渡す。
- `context: fresh` を明示し、親の会話全体を fork しない。
- `includeProgress: false`、`maxOutput` で短い返却に制限。
- 大きな調査は file-only とし、結論・根拠・成果物パスだけ読む。
- 結果上限を設けなければ、長い最終回答で親が再び膨らむ。inline child output に既定 cap はない。
- 上限値は運用時に決める。例えば数 KiB の結論と、必要時に参照する詳細ファイルを分離する。
- 子のログが分かれることと、返却結果のモデル token がゼロになることは別。

### git-commit

- 個人用 agent Markdown に Git の手続き、対象選定、確認事項、返却形式を置く。
- モデル、ツール、extensions、skills、instruction inheritance を明示する。
- 本来の repository と `.git` を必要な範囲で操作する。並列の Git-mutating 子は避ける。
- 最終回答は commit SHA、対象、短い理由、未完了事項程度にする。
- 自動 push、amend、rebase、reset、hook 実行の扱いは導入前に確認する。今回勝手に定義しない。
- 一般的な bash は「git commit だけ」の強制境界ではない。禁止操作を強制するなら別途 command policy が必要。

### researcher

- 個人用 agent Markdown に専用 launcher 名を固定する。
- 研究用 working directory は `~/tmp/<job>` とし、repo は必要なら read-only で見せる。
- OS sandbox で tmp 外への task 書き込みを禁止する。symlink と shell / subprocess 経由も試験対象。
- 認証、session、artifact、通信 channel など実行基盤の書き込み先は別途必要。
  できるだけ専用 tmp runtime に集約し、「tmp-only」の例外を明示する。
- package docs の launcher contract は agent directory を含む runtime paths へのアクセスを要求する。
  既存 `~/.pi/agent` を丸ごと writable にしては厳密な tmp-only と言えない。
  分離した child agent-dir で認証／設定の最小コピーが可能か、起動試験で確認する必要がある。
- ネットワークは調査用に許可してよいか未確認。filesystem sandbox は情報送信を防ぐものではない。
- launcher は background-only。unknown launcher は無制限起動へ fallback せず失敗する。
- project agent が個人定義を shadow できるため、信頼済み project と名前の衝突も境界に含める。

## pi-better-subagents の重要な留意点

- catalog の role/agent 定義は主に persona、モデル、effort の指定であり、
  per-agent tools／filesystem／sandbox 指定をそのまま実行時権限にする仕組みではない。
  required な未対応 execution restriction は launch を拒否する。
- `sandbox_dir` / `cwd` を tmp にし、outside を Read に絞る構成は有力。
  ただし定義が researcher の root を自動的に固定する保証ではない。
- `/sandbox` の設定は別の sandbox extension が event bus に公開する profile を参照する。
  package 単体と companion 有効時では挙動が異なる。
- 現行 docs には古い「workspace-only」説明と広い既定値の記述が併存する。
  広い profile は Outside=Write、Stored credentials=Write & delete を既定として説明しており、
  README の「sandboxed」だけで tmp-only と判断してはいけない。
- 有効な人間設定 profile は `sandbox:false` で回避できないことを
  `permission-policy.ts` の `resolveSubagentPermissions` で確認した。
  profile がない legacy policy は model による opt-out を許す。
- trusted extension tools は task filesystem rules の外で動く。
- docs には default-on の backend 不在時 fallback の記述もある。
  明示 sandbox と、backend 不在・起動失敗時の実動作を導入試験に含める。
- 元 repo への commit と、disposable clone での commit は異なる。
  linked worktree は `.git` 管理情報が sandbox root 外にある場合があり、安易に両者を混同しない。

## 確認範囲と未検証事項

確認済み:

- npm registry の現行 dist-tag と配布 tarball を取得。依存インストール、lifecycle script 実行、拡張ロードはしていない。
- 各候補の README、主要設定 docs、package manifest。
- `pi-subagents` の custom-agent、context/output controls、launcher contract、child permissions docs。
- `pi-better-subagents` の catalog/usage と permission-policy 実装。
- 全候補の host peer 宣言は Pi 1.1.0 を排除していない。ただしこれは動作試験ではない。
- この環境では bwrap が PATH にあり、最小の read-only root / PID namespace 起動は exit 0。
  拡張の sandbox 完全性を試験したわけではない。

未検証:

- 実 Pi 1.1.0 の extension loader／SDK 互換性。
- Nix store と child runtime の解決、認証 lock、独立 agent-dir での起動。
- モデル呼び出し、親へ入る実際の result、キャンセル／再開。
- researcher の範囲外 write / edit / bash / symlink / subprocess がすべて拒否されること。
- macOS での sandbox 互換性。
- 全ソースのセキュリティ監査、全候補を網羅した保守状況評価。

採用時には npm tarball と全 runtime dependencies を固定し、既存パッケージ同様に
Home Manager から entrypoint を配置する。可変 latest で本番導入しない。
今回すでに稼働している pi 設定や flake inputs は変更していない。

## 参照・調査ファイル

- https://github.com/nicobailon/pi-subagents
- https://github.com/1aboveio/pi-better-harness/tree/main/packages/pi-better-subagents
- https://github.com/championswimmer/pi-subagent-manager
- https://github.com/AgwaB/pi-subagent
- https://github.com/ByteTrue/pi-package-mono/tree/main/packages/pi-subagent
- https://www.npmjs.com/package/pi-subagent-feather

取得した metadata / version / integrity と配布物は
`~/tmp/pi-subagent-research/<package>/registry.json` および `package/` に保存。

## permission-system の削除

稼働 Nix 定義からはすでに除外済みだった。今回は残存物を削除した:

- `~/.pi/agent/disabled-extensions/20-permission-system.ts`
- 空の `~/.pi/agent/extensions/pi-permission-system/` と disabled-extensions directory
- `~/.config/home-manager/pi-permissions/`（classifier と設定／schema／テスト含む）
- `~/.config/home-manager/pi-extension-research.md`（旧 permission 調査記録）
- `~/.local/state/pi-permissions-backups/`
- `~/tmp/pi-extension-research/`（旧調査用配布物）
- `~/.pi/agent/logs/tool-gate.jsonl`

conversation-history README の古い permission 依存／check 記述も修正した。
会話履歴の引用、Nix store と過去 Home Manager generation は残している。
これらまで削除すると会話・rollback の履歴や共有 store を巻き込むため、
今回「完全削除」を履歴の抹消とは解釈していない。Nix GC は実行していない。
