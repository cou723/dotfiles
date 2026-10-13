# Pi subagents（Claude Code に近い実行モデル）

実行基盤: [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) **0.77.0**（MIT）。
`npm-sources.json` に本体を含む7パッケージの URL・正確な版・SHA-256 を固定。
インストールスクリプトは実行せず、Pi の SDK は Home Manager の固定ホストから共有する。
Node 24 と Git はランチャーの PATH に供給する。Claude CLI / Claude の認証は不要。

## 使い方

新しい Pi セッションで、例えば次のように依頼する。

- 「scout に認証処理を調べさせて」
- 「正しさとテストの観点で reviewer を並列に実行して」
- 「worker にこの変更をバックグラウンドで実装させて」
- 「この結果を読んで、同じ子エージェントを再開して」

`/subagents`、`/subagents-doctor`、`/subagents-fleet`、`/subagents-guide` は上流の操作画面・診断。
`/claude-agents` は互換変換のエラー一覧。定義の外部編集後は `/reload`。
Claude 定義 `name: audit` は **`claude-audit`** として呼び出す（Pi の同名定義や builtins と区別する）。
既定設定は fresh コンテキスト、前景実行、同時実行上限4、ネイティブ Git worktree。
`config.json` は Nix 管理で読み取り専用。設定変更はこのソースを編集して再適用する。
`subagent` は上流のツール名であり、Claude Code の `Agent` / `Task` ツールの引数そのものとは互換でない。
詳しい操作は同梱の `extensions/subagent/docs/` にある。

## 互換性と差分

| 機能 | この構成 |
|---|---|
| 子の独立コンテキスト、結果を親へ返す | 上流の fresh child。親の履歴を引き継ぐ fork は明示的な別オプション |
| 並列、バックグラウンド、再開、停止 | 上流機能。保存済みセッションや実行状態の条件がある |
| worktree 分離 | 上流の `worktree` オプション。自動マージではない |
| Pi 形式の定義 | `~/.pi/agent/agents/`、信頼済みプロジェクトの `.pi/agents/` |
| Claude 形式の定義 | `~/.claude/agents/*.md`、信頼済みプロジェクトの `.claude/agents/*.md` |
| Claude 定義の優先順位 | ユーザー < 祖先 < 作業ディレクトリ。Git ルートで祖先探索を停止。同名の Claude 定義は上書き。`claude-` 接頭辞の Pi 実行時定義として登録。Pi 定義とは別名前空間 |
| Claude YAML | `name` / `description` / 本文、`tools`、`disallowedTools`、`model`、`background` |
| Claude ツール名 | Read→read、Write→write、Edit→edit、Bash→bash、Grep→grep、Glob→find、LS→ls。呼び出し引数は Pi の形式。Glob と find の検索仕様は同一ではない |
| モデル | 未指定 / inherit は Pi のモデル継承。明示 ID は Pi が解決。sonnet/opus/haiku/fable は曖昧なので拒否し、provider/model ID の指定を要求 |
| permissionMode | default は既存の権限拡張。plan は bash/edit/write を除く保守的な読み取り専用近似（Claude の plan と同一ではない） |
| color | 定義を受理するが表示色は上流 UI に従う |
| 未対応の Claude 設定 | maxTurns、hooks、skills、memory、mcpServers、isolation、effort などは拒否。Pi ネイティブ定義で提供できる類似機能があっても自動変換しない |
| 権限継承 | 前景・背景・再開・ネストのネイティブ子に既存 permission-system / auto-review を必須ロード。必須拡張をロードできない外部 CLI / リモート実行は拒否 |

Claude 定義の tools が未指定でも、閉じた Pi 標準7ツールのみを付与する。
MCP / Agent / Task / Skill / WebFetch / WebSearch やツールの引数パターン指定は拒否する。
Claude 互換定義は再委任を許可せず、fresh を既定とし、リポジトリとグローバルの指示を読む。
未知の設定を持つ定義は診断を表示して起動を失敗させる。低優先度の同名 Claude 定義にフォールバックしない。
`claude-` 接頭辞はこのアダプター用に予約する（同名の Pi 定義を別途置くと上流が名前衝突を拒否する）。
ユーザー・信頼済みリポジトリの拡張は信頼された実行コードであり、この構成は OS サンドボックスではない。
権限確認の自動審査は既存 auto-review の設定に従う。前景の子は親の UI を持たないため、承認の追加対話が必要な操作は失敗する場合がある。

## 検査・適用

```sh
nix build .#checks.x86_64-linux.pi-subagents --no-link -L
nix build .#checks.x86_64-linux.pi-toolsets .#checks.x86_64-linux.pi-toolset-module --no-link -L
home-manager switch --flake .#coura
```

検査は固定ホストの実 loader、Claude YAML の変換、信頼・優先順位・未対応設定、必須権限拡張の登録と外部 runner 拒否を対象にする。
決定論的なテスト専用モデルを使い、実際のネイティブ子と Claude 互換子が fresh で完了すること、未対応定義の起動が失敗することを検証する。テスト専用 provider は導入リソースに含めない。
実サービスの認証を伴うモデル実行、background / resume / worktree の実ワークフローは別途検証が必要。
設定から `subagents` を外すと管理リンク・専用依存を解除できる。ユーザーの定義やセッション成果物は削除しない。
