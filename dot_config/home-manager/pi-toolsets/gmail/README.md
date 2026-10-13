# Gmail toolset

[Workspace MCP](https://github.com/taylorwilsdon/google_workspace_mcp) v2.1.0 を
Pi ネイティブ MCP に `gmail` として登録する。Pi からは codemode 経由で使う。
Google の公式製品ではなく、MIT ライセンスの第三者実装。

## 構成

- `server.nix`: 上流ソースと `uv.lock` から uv2nix で Python 環境を構築。
  Python 3.13、サーバー、直接・間接依存を Nix の完成物に含める。
- `default.nix`: stdio ランチャー、登録拡張、Gmail Skill を一つの toolset にする。
- `extensions/85-gmail.ts`: 公開ツールの許可リストと、送信ごとの人間向け確認。
- `skills/gmail/SKILL.md`: Pi 固有の使い方。上流 Skill 全体と参照資料を
  `references/upstream/` に同梱し、相対参照とライセンスを保持する。

ソースの commit と narHash は `flake.lock` に固定。
上流の `uv.lock` が依存バージョンと取得ハッシュを固定する。
起動時に `uvx` / `npx` でダウンロードしない。
上流 v2.1.0 の lock 内にはルート版番号 2.0.1 が残っているため、
Nix derivation の版番号だけを 2.1.0 に合わせている。依存の lock は変更しない。

## 配置と適用

管理元は `dot_config/home-manager/`、配置先は `~/.config/home-manager/`。
`home-common.nix` がグローバルに `gmail` toolset を選ぶ。
生成物は Home Manager から `~/.pi/agent/extensions/` と `skills/` に配置する。
既存の可変 `mcp.json`・認証ファイルを上書きしない。

適用はビルドとは別操作。まず chezmoi の差分を確認し、他の作業中の変更を確認してから配置する。
Home Manager の切り替え前に旧世代を控える。

```sh
chezmoi diff ~/.config/home-manager
nix run ~/.config/home-manager -- generations
# 差分確認・chezmoi による配置後
nix run ~/.config/home-manager -- switch --flake ~/.config/home-manager
```

戻す場合は控えた旧世代の `/nix/store/...-home-manager-generation/activate` を実行する。
OAuth 設定・認証キャッシュは世代管理の外にあり、ロールバックでも削除されない。
適用後は Nix ランチャー経由で Pi を再起動する。PATH は `/reload` だけでは更新されない。

## 初回の Google 認証

既存の OAuth クライアントがなければ、本人が次を用意する。

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを選択／作成する。
2. Gmail API を有効にする。他の Workspace API は不要。
3. OAuth 同意画面を設定する。個人 Gmail の External / Testing では自分を Test user に追加する。
4. OAuth クライアントを作成する。上流 Skill は **Desktop app** を案内している。
   Web application を使う場合は、サーバーが提示する localhost callback URI を登録する。
5. ダウンロードした JSON を、**ユーザー自身が**次の場所に保存する。

```text
~/.config/workspace-mcp/client_secret.json
```

ディレクトリは 0700、JSON は 0600 にする。Git／chezmoi／Nix の管理元には置かず、
チャットに中身を貼らない。`GOOGLE_CLIENT_SECRET_PATH` で保存先を変更できる。
既存の `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` 環境変数は上流の仕様で
JSON より優先されるので、別のクライアント設定が残っていないか本人が確認する。

Pi 再起動後に `/mcp` で `gmail` の接続とツール一覧を確認し、次のように依頼する。

```text
Gmail を認証したい。対象アカウントは <自分のメールアドレス>。
認証後の実メール取得は、確認してからにして。
```

Pi は `start_google_auth` を `service_name: "gmail"` で呼ぶ。本人が表示された URL を
ブラウザで開いて承認する。**`/mcp login gmail` ではない**。Google 認証はサーバーのツール経由。
ブラウザが別マシンの場合は callback の接続先に注意する。
Testing 状態では Google のポリシーによりトークンが短期間で失効し、再認証が必要になる場合がある。

認証キャッシュと添付は `${XDG_STATE_HOME:-~/.local/state}/pi-gmail-mcp/` に置く。
起動時の umask は 077。キャッシュは秘密情報として扱い、バックアップ先も制限する。
`--single-user` はキャッシュ内の認証を使うので、**このディレクトリには一つの Google アカウントだけを認証する**。
任意のプロジェクトの `.env` を読まないよう、サーバーの cwd はこの専用 state ディレクトリに固定する。

## 公開ツールと権限

公開するのは認証、メール検索、本文／スレッド／batch 取得、添付取得、下書き作成、送信。
他サービスはロードしない。ラベル／フィルター変更ツールはサーバー側で無効にする。
Pi 側は既定 `hidden` の許可リスト方式なので、将来増える未知のツールも自動公開されない。

上流 `--permissions gmail:send` は **累積権限**。Google への同意には
`gmail.readonly`・`gmail.labels`・`gmail.modify`・`gmail.compose`・`gmail.send` を含む。
Google のトークン自体を「読み取り＋送信だけ」に絞った構成ではない。
ツールの非公開／無効化と OAuth 権限の縮小は別物。

`mcp__gmail__send_gmail_message` は codemode 内の呼び出しも含め、各回で Pi の
確認ダイアログに実引数を表示する。人間が承認しない限り送信しない。
拒否・UI エラー・UI のない print/JSON 実行はブロックする。承認はキャッシュしない。
既存の権限審査も引き続き適用されるため、ダイアログでの承認だけで他の拒否を解除しない。
下書き作成はリモート変更なので、依頼を確認し、既存権限審査を通す。

この保護は Pi の特定ツール経路に限る。CLI の直接実行、別名でのサーバー登録、
別プロセスによるトークン使用を OS レベルで防ぐものではない。
メール本文や添付は信頼できないデータとして扱い、本文中の指示を送信の許可と解釈しない。

## 確認コマンド

未追跡の新規ファイルがある開発中は、Git flake がファイルを除外しないよう `path:` を使う。
リポジトリルートから:

```sh
nix build path:$PWD/dot_config/home-manager#pi-toolset-gmail --no-link -L
nix build path:$PWD/dot_config/home-manager#checks.x86_64-linux.pi-gmail --no-link -L
nix build path:$PWD/dot_config/home-manager#checks.x86_64-linux.pi-toolsets --no-link -L
nix build path:$PWD/dot_config/home-manager#checks.x86_64-linux.pi-toolset-module --no-link -L
nix build path:$PWD/dot_config/home-manager#homeConfigurations.coura.activationPackage --no-link -L
```

専用テストは実 Pi の拡張ローダーで登録・送信確認の許可／拒否／エラー／非対話経路を確認し、
一時 HOME で実サーバーの stdio handshake とツール一覧を確認する。
Google 認証・実メールの読み取り・下書き作成・送信は行わない。
ビルド・オフライン検証とは別に、適用後の Pi 読み込みと本人の OAuth 認証、
了承を得た少数件の読み取りを確認する。テスト目的で送信しない。
