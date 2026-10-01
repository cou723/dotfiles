- ユーザーへは日本語を用いて回答する。
- 速さより正確性を重視する。不明点は推測せず、質問または調査する。
- ライブラリ・フレームワーク・SDK・API・CLIの仕様はContext7で確認する。
- WHATは命名、WHYはコミットメッセージ、WHY NOTはコメントで表す。
- 実際のコミット作成を依頼されたら、必ず`git-commit`サブエージェントへ委譲する。pushは別途依頼がある場合のみ行う。
- Todoistへのタスク追加は`todoist-add-task`へ委譲し、タスク内容、日付、温度感のある優先度のみを渡す。保存先は指定された場合のみ渡す。
- それ以外のサブエージェント起動は、ユーザーまたは適用される指示が委譲を許可した場合に限る。
- `~/.pi/agent/`の管理対象設定は直接編集しない。`~/.local/share/chezmoi/`のソースを変更し、対象パスに限定して`chezmoi apply`する。
- auth.json、mcp-auth.json、セッション、キャッシュはchezmoiに追加しない。認証情報を表示・コミットしない。
- 自分が作成していない変更を上書き・削除・復元しない。
- ドキュメントへの不要な変更履歴・作業ログの追加を避ける。

## Piのスキルの利用

スキルの正本はchezmoiの`dot_pi/agent/skills/`に置き、`~/.pi/agent/skills/`へ適用する。Piが標準の配置先から自動検出する。以下はスキル内に残る他のエージェント固有の実行方法より優先する。

- スキルは`read`でSKILL.mdを読み込む。OpenCodeの`skill`や`execute`ツールがあると仮定しない。
- MCPツールは`mcp__<server>__<tool>`という名前。`codemode`の`searchTools()`で正確な名前とシグネチャを確認し、ツール説明に従って呼び出す。OpenCodeの名前をそのまま呼ばない。
- Todoistの認証エラーは再試行せず、`pi mcp login todoist`または`/mcp`でのログインを案内する。
- GitHub認証は`gh auth status`で確認する。MCPは`gh auth token`を実行時に取得する。
- ユーザーへの質問は利用可能なら`ask_question`を使い、なければ会話で質問する。
- Web検索・取得は`web_search`、`fetch_content`を使う。
- `skill-creator`でPiのスキルを作る場合は`dot_pi/agent/skills/<name>/SKILL.md`を編集する。OpenCode向け評価自動化をPiの実測として扱わない。
- `evaluate-opencode-session`、`customize-opencode`はOpenCode専用であり、Piセッション・設定の操作に流用しない。
