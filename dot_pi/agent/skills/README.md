# Pi skills

Pi のグローバルスキル集。正本は chezmoi の `dot_pi/agent/skills/` に置く。

## 編集と適用

`~/.local/share/chezmoi/dot_pi/agent/skills/` を編集し、対象スキルだけ反映する。

```sh
chezmoi apply ~/.pi/agent/skills/<skill-name>
```

Pi で `/reload` すると、標準配置先 `~/.pi/agent/skills/` から再検出される。
MCP、質問、Web取得などの実行方法は `~/.pi/agent/AGENTS.md` に従う。

## スキル一覧

| 名 | 用途 |
|---|---|
| `collect-session-logs` | 過去の Claude Code ログの収集・相関付け |
| `context7-mcp` | ライブラリ・API仕様の確認 |
| `customize-opencode` | OpenCode専用設定の扱い（Pi設定には流用しない） |
| `evaluate-opencode-session` | 過去のOpenCodeセッションの評価（Piには流用しない） |
| `evaluate-run` | 過去のissue-loop実行の評価 |
| `github` | GitHub操作 |
| `principle` | プロジェクト原則の策定・監査 |
| `skill-creator` | スキルの作成・改善・評価 |
| `todoist` | Todoistタスク管理 |

## 注意

- 認証情報・セッション・キャッシュ・評価出力はこのディレクトリで管理しない。
- FDM設計系スキルはreplicadプロジェクトの `.agents/skills/` を正本とする。
