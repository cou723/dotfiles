# Google 公式 Gmail MCP toolset

Google が運用するリモート MCP を Pi 標準 MCP に `gmail` として登録する。
接続先は https://gmailmcp.googleapis.com/mcp/v1 （Streamable HTTP）。
第三者の Workspace MCP／ローカル Python サーバーは不要。

公開するのは検索・メール／スレッド閲覧・下書き一覧・ラベル一覧・下書き作成。
送信・ラベル変更・削除は公開しない。新しい未知のツールも既定 hidden。
送信はユーザー自身が Gmail で行う。

## 利用条件（重要）

公式版は **Developer Preview**。公式手順では
**Google Workspace Developer Preview Program への参加**が前提とされている。
API を有効にできることと、アカウントが利用対象であることは別。
参加条件・提供状況を先に公式資料で確認する。

- [公式セットアップ](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server)
- [公式ツール一覧](https://developers.google.com/workspace/gmail/api/reference/mcp)

Nix は登録拡張と Skill を固定するが、Google 側の実装・ツールスキーマは固定しない。
Pi でのブラウザ認証と実アカウントへのアクセスは、本人による初回確認が必要。

## 初回の Google Cloud 設定

### 1. 両方の API を有効にする

OAuth クライアントを作る Google Cloud プロジェクトで、次の **両方**を有効にする。

- **Gmail API**: `gmail.googleapis.com`
- **Gmail MCP API**: `gmailmcp.googleapis.com`

Google Cloud Console から有効化すればよい。gcloud がある場合は:

```sh
gcloud services enable gmail.googleapis.com gmailmcp.googleapis.com --project=YOUR_PROJECT_ID
```

### 2. OAuth 同意画面を設定する

Google Auth Platform の Branding / Audience / Data Access を設定する。
個人 Gmail では External を選び、Testing の場合は自分を Test user に追加する。
Data Access に次を登録する。

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
```

**`gmail.compose` はトークンとしては下書き管理と送信を許可する。**
Pi に送信ツールを公開しないことは、トークンから送信権限を除くことではない。
Testing 状態では再認証が必要になる場合がある。

### 3. OAuth クライアントを作る

Google Auth Platform → Clients → Create Client:

- Application type: **Web application**（旧ローカル版の Desktop app ではない）
- Name: 例 `Pi Gmail MCP`
- Authorized redirect URIs に次をそのまま登録:

```text
http://127.0.0.1:8766/callback
```

このポートを別プロセスが使っている場合は認証できない。
クライアントの JSON をダウンロードする。

### 4. JSON を秘密ファイルとして保存する

**ユーザー自身が**ダウンロードした JSON を次に保存する。
中にはトップレベルの `web` と、その中の `client_id`、
`client_secret`、`redirect_uris` が必要。

```text
~/.config/pi-gmail/client_secret.json
```

```sh
mkdir -p ~/.config/pi-gmail
chmod 700 ~/.config/pi-gmail
# ダウンロードした JSON を上記の client_secret.json として配置した後:
chmod 600 ~/.config/pi-gmail/client_secret.json
```

JSON の中身やコールバック URL をチャットに貼らない。
Git・chezmoi・Nix store・生成ログに入れない。
`XDG_CONFIG_HOME` がある場合はその下の `pi-gmail/client_secret.json` を使う。
`GMAIL_MCP_CLIENT_SECRET_PATH` で絶対パスを指定してもよい。
プロジェクトの `.env` は読まない。拡張が Pi 起動／reload 時に直接読む。

未配置・JSON 不正・Desktop app・callback 不一致では、サーバーを disabled として登録し、
UI に設定案内を表示する。秘密や JSON のパースエラーは表示しない。

## 配置と適用

管理元は `dot_config/home-manager/`、配置先は `~/.config/home-manager/`。
Home Manager は `~/.pi/agent/extensions/85-gmail.ts` と `skills/gmail/` を配置する。
`mcp.json`・OAuth 状態・秘密ファイルは管理／上書きしない。

作業中の別変更がないか chezmoi 差分を確認し、切り替え前に旧世代を控える。

```sh
chezmoi diff ~/.config/home-manager
nix run ~/.config/home-manager -- generations
# 差分確認後:
chezmoi apply ~/.config/home-manager
nix run ~/.config/home-manager -- switch --flake ~/.config/home-manager
```

適用後は Nix ランチャー経由で Pi を再起動する。
戻す場合は控えた旧世代の `/nix/store/...-home-manager-generation/activate` を実行する。
認証・秘密は世代管理外なので、ロールバックしても削除されない。

## Pi 内でログイン

JSON を配置して Pi を起動したら、Pi の入力欄で実行:

```text
/reload
/mcp
/mcp login gmail
```

`/mcp` で登録元が `85-gmail.ts`、接続先が Google 公式 URL であることを確認する。
同名の `gmail` がユーザー／プロジェクトの `mcp.json` にあると拡張より優先される。
競合は本人が確認し、既存の可変設定を勝手に削除しない。

ブラウザで対象の Google アカウントを選び、権限を確認して承認する。
SSH 等でブラウザが別マシンなら、Pi の認証 UI が案内する
リダイレクト URL の貼り付けを使う。通常のチャットには貼らない。

**shell の `pi mcp login gmail` は使わない。**
shell コマンドはこの登録拡張を読み込まない。
OAuth トークンは Pi の `~/.pi/agent/mcp-auth.json` に保存される。
認証だけでは実メール取得を行わず、了承後に少数件の検索を確認する。
診断目的で下書きを作らない。

## 構成と検証

- `default.nix`: 登録拡張と Skill を Nix の完成パッケージにする。
- `extensions/85-gmail.ts`: 秘密 JSON の読み込み・検証、HTTP/OAuth 登録、許可リスト。
- `skills/gmail/SKILL.md`: 検索・閲覧・明示的に依頼された下書き保存の手順。
- `smoke-test.mjs`: 実 Pi ローダーで正常／不正／未配置の認証設定とツール公開範囲を確認。
  架空のクライアントを使い、Google 認証・実メール取得・下書き作成は行わない。

リポジトリルートから:

```sh
nix build path:$PWD/dot_config/home-manager#pi-toolset-gmail --no-link -L
nix build path:$PWD/dot_config/home-manager#checks.x86_64-linux.pi-gmail --no-link -L
nix build path:$PWD/dot_config/home-manager#checks.x86_64-linux.pi-toolsets --no-link -L
nix build path:$PWD/dot_config/home-manager#checks.x86_64-linux.pi-toolset-module --no-link -L
nix build path:$PWD/dot_config/home-manager#homeConfigurations.coura.activationPackage --no-link -L
```

旧ローカル版の `~/.config/workspace-mcp/` や `~/.local/state/pi-gmail-mcp/` は使わない。
もし存在しても自動削除しない。不要な旧認証の取り消しは本人が行う。
公開設定はこの Pi 経路の制限であり、別プロセスによるトークン使用を OS レベルで防ぐものではない。
