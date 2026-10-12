# Pi のグローバル環境で使う Context7

公式の `@upstash/context7-pi` 拡張を使います。バージョンは 0.1.2 に固定し、tarball の SHA-256 ハッシュも指定しています。
実行時の依存はホストが提供する Pi/typebox だけです。npm インストール、npx によるダウンロード、ライフサイクルスクリプトの実行は行いません。

Home Manager は Linux と macOS のグローバル環境に、同じリソースを配置します。

- `~/.pi/agent/extensions/70-context7.ts`
- `~/.pi/agent/skills/context7-docs/SKILL.md`
- `~/.pi/agent/prompts/c7-docs.md`（`/c7-docs` プロンプトテンプレート）

Pi は `resolve-library-id` と `query-docs` の2つを直接呼び出せるツールとして認識します。
MCP サーバーや `mcp.json` の設定は不要です。Skill はライブラリのドキュメントを調べる手順を案内します。
導入後は `/reload` を実行するか、Pi を再起動してください。

## 認証情報とプライバシー

認証情報なしでも使えますが、Context7 の IP アドレス単位のレート制限が適用されます。
利用枠を増やすには、Pi を起動する前に個人用の `CONTEXT7_API_KEY` を環境変数として設定してください。
キーはローカルの秘密情報管理に保存し、Nix、追跡対象の設定ファイル、ツールの引数には含めないでください。

どちらのツールもクエリを `https://context7.com/api` に送信し、ドキュメントを返します。
クエリに秘密情報、個人情報、非公開のソースコードを含めないでください。
サーバー側の内容とサービスの利用可否は Nix で固定できません。再現可能なのは、導入する拡張と設定だけです。

## 権限ポリシー

chezmoi は隣接する `pi-permission-auto-review/permission-system.json` を配置します。
次の3つの名前を持つツールは、AI レビューなしで明示的に許可されています。

- `ask_user_question`
- `resolve-library-id`
- `query-docs`

その他のツール、Bash、MCP には、引き続き `ask` とモデルによるレビューが適用されます。
この例外は名前で判定するため、同じ名前を登録する別の拡張があれば確認してください。
codemode 経由の呼び出しでは、外側の codemode スクリプトにレビューが必要な場合があります。この例外は codemode 自体には適用されません。

## テスト

Home Manager の flake ディレクトリで実行してください。

```sh
nix build .#checks.x86_64-linux.pi-context7 --no-link -L
nix build .#checks.x86_64-linux.pi-permission-auto-review --no-link -L
```

Context7 の検査では、実際の Pi ローダーと模擬 API 応答を使い、検索、ドキュメントへのクエリ、任意の認証、レート制限のメッセージを確認します。
実際の permission-system の判定処理も使い、上記の名前だけが例外になり、無関係なツールは引き続き `ask` と判定されることを確認します。
Nix の検査では、ネットワーク通信や LLM の呼び出しは行いません。
