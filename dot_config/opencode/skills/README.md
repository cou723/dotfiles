# opencode-skills

[opencode](https://opencode.ai) のグローバルスキル集。

ローカル `~/.config/opencode/skills` をマスターとして管理し、
バックアップ・PC 移行・共有のために git 管理しているリポジトリ。

## 使い方

**新規環境（PC 移行時等）:**

```bash
git clone https://github.com/<owner>/opencode-skills.git ~/.config/opencode/skills
```

**変更のバックアップ:**

```bash
cd ~/.config/opencode/skills
git add -A
git commit -m "<メッセージ>"
git push
```

## スキル一覧

| 名 | 用途 |
|---|---|
| `collect-session-logs` | 過去の Claude Code セッションログを横断収集・相関付け |
| `context7-mcp` | ライブラリ・フレームワークの API 参照・コード例（Context7） |
| `customize-opencode` | opencode のグローバル/プロジェクト設定の編集・作成 |
| `evaluate-run` | 過去の issue-loop 実行をセッションログから復元・評価 |
| `github` | GitHub 操作（リポジトリ・Issue・PR 等） |
| `principle` | プロジェクト原則（docs/principles）の策定・洗練・監査 |
| `todoist` | Todoist タスク管理（追加・更新・完了・検索） |

## 注意事項

- FDM 設計系スキル（`fdm-design-review`, `preview-gcode`, `replicad-fdm-design`）は replicad プロジェクト側（`.agents/skills/`）に最新版を置き、グローバルから除外している。
- このディレクトリには原則 SKILL.md のみを入れる。
- 秘密情報（API キー、トークン等）は**絶対にこのリポジトリに commit しない**。
  - 認証情報は環境変数（`~/.zshrc` 等）または MCP 設定側に保持する。
  - `.gitignore` に `.env` / `*.token` / `credentials*` 等を除外済み。
