# Pi sandbox とプロファイル選択UI

`@xzzpig/pi-sandbox@0.8.0` を依存として読み込み、公開 API の `SandboxService` でプロファイルを切り替えるローカル拡張。
Pi はこのディレクトリの `index.ts` を自動的に読み込む。別途 `pi install npm:@xzzpig/pi-sandbox` は実行しないこと。二重に起動するため。

## 操作

- `Alt+A` または `/sandbox-profile`：プロファイル選択画面を開く。
- ↑↓で選択、Enter で適用、Esc でキャンセル。
- `/sandbox-profile review`：名前を指定して切り替える。
- `/sandbox`：制限の設定とセッション内の許可を表示する。
- `/sandbox-enable`・`/sandbox-disable` または `Alt+S`：サンドボックスの有効・無効を切り替える。

エージェントの実行中は、このUIからのプロファイル切り替えを拒否する。
ステータス欄の有効状態とプロファイル名は pi-sandbox 自身が表示する。選択しただけで有効になったとは判断しないこと。
サンドボックスが無効な状態で選択した場合は、API が返す警告をそのまま表示する。
切り替えは現在のセッションにのみ適用される。再起動・`/reload` 後は `workspace` に戻る。
子セッションの起動側が環境変数で指定したプロファイルは、その指定を優先する。

## 設定

`~/.pi/agent/sandbox.json` でファイルと通信の制限を定義する。

| 名前 | 制限 |
|---|---|
| `review` | 読み取り専用・通信禁止 |
| `workspace` | 作業領域と /tmp の編集可・通信禁止。起動時の初期設定 |
| `workspace-network` | 編集可。registry.npmjs.org と api.github.com への通信を許可 |

読み取りを許可する一覧には、作業領域、Nix store、一時領域、Pi のスキル・拡張、Home Manager 設定、chezmoi 管理元を含めている。
`.env`、SSH・AWS・GnuPG の設定ディレクトリ、Pi の認証ファイルは明示的な拒否対象。
名前付きプロファイルでは、拒否対象の読み取りは追加許可の確認を出さずにブロックする。
`permissionPromptTimeoutSeconds` は60秒。確認の時間切れでは許可しない。
ユーザーが入力する `!` / `!!` は sandboxUserShell=false により対象外。手作業の保守用コマンドまで閉じ込めない設定にしている。

## 再現手順

chezmoi 管理元にある `.github/scripts/setup-xzzpig-sandbox.sh` を使うか、次の手順で依存を準備する。

```bash
cd ~/.pi/agent/extensions/xzzpig-sandbox-ui
npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
node prepare-runtime.mjs
npm test
python3 test/verify-runtime.py
```

Linux の bubblewrap・socat・ripgrep、Pi 本体と Node.js は、chezmoi 管理の `dot_config/home-manager/` にある Nix 設定で指定済み。
`prepare-runtime.mjs` は、配布パッケージに同梱された Linux 用 `apply-seccomp` の実行権限を戻すだけのスクリプト。パッケージのソースや権限ルールは変更しない。

## 制限と未検証の点

- この拡張は Pi 本体や任意の拡張コードを丸ごと隔離しない。主な対象は Bash と read/write/edit。
- 独自ツール、MCP、ls/find/grep が同じように制限されるとは保証しない。
- Linux の Bash では allowWrite/denyWrite の glob を強制できないため、設定では具体的なパスを指定している。`.env.*` などへの包括的な制限は設定していない。
- プロファイル切り替え時に、それまでに追加したセッション内の許可を消去するAPIはない。許可をすべて取り消したい場合は `/reload` または再起動すること。
- 信頼済みのプロジェクト設定もマージされる。任意のプロジェクト設定、シンボリックリンク、ネットワークの迂回耐性までは検証していない。
- 配布パッケージに同梱された node-forge 1.4.0 は、先に確認した署名検証の脆弱性 GHSA-86w9-cpqp-85rv の対象。今回の `npm audit` は npm 内部のエラーで完了しておらず、警告がないと判断したわけではない。

## 検証

- UI 自動テスト4件：適用、キャンセル、実行中拒否、無効状態の警告表示。
- 実 Pi と実サンドボックス：作業領域への書き込み、領域外のリダイレクト・パイプの拒否、Bash と native read の呼び出しチェックによる `.env` 拒否、未知のプロファイルの拒否、review への切り替えと workspace への復帰。
- Pi のコマンド登録と、実端末での Alt+A 選択画面。

## 移行前の構成

復元用コミットは `7598c15`。古い pi-perm UI は `~/.pi/agent/disabled-extensions/pi-perm-ui/` に移してあり、自動読み込みの対象外。
復元手順と既知の問題は、そのコミットの `.github/docs/pi-sandbox-checkpoint.md` を参照すること。
複数のサンドボックス拡張を同時に有効にしないこと。
