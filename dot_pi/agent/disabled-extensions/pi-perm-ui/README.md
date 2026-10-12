# Local pi-perm UI

Pi 1.1.0 用のローカル拡張。`pi-perm@0.1.8` のコアを一度だけ起動し、プロファイルを選ぶ UI を追加する。
Pi は通常の拡張探索で `~/.pi/agent/extensions/pi-perm-ui/index.ts` を自動的に読み込む。
別途 `pi install npm:pi-perm` を実行すると二重登録になるため、実行しないこと。

## 操作

- `Alt+A` または `/pi-perm`：プロファイル選択画面を開く。現在のプロファイルは先頭に `●` 付きで表示される。
- ↑↓：選択、Enter：適用、Esc：キャンセル。
- `/pi-perm list`：すべてのプロファイル名を表示する。
- `/pi-perm use <name>`：プロファイルを直接切り替える。名前の引数補完も使える。
- `/pi-perm status`：ポリシーの詳細を表示する。
- `/pi-perm audit`：pi-perm の監査ログ情報を表示する。
- ステータス欄：`Permissions: <name>` の形式で現在のプロファイルを表示する。

エージェントの実行中は切り替えを拒否する。必要なら Esc で実行を停止してから選択画面を開く。
別のプロファイルを選んで適用すると、pi-perm の切り替え処理がセッション内の一時許可を消去する。
キャンセルした場合や、現在のプロファイルを選び直しただけの場合は、プロファイルも一時許可も変更しない。
UI で `:danger-full-access` を選択すると、適用前に追加の確認が表示される。

切り替えた設定は、現在の拡張ランタイムのメモリー上にだけ保持される。
再起動や `/reload` を行うと、設定ファイルの `activePermissionProfile` に戻る。
選択の永続化や、子セッションへ選択を引き継ぐ機能は追加していない。

## 設定

ユーザー設定ファイルは `~/.pi/agent/extensions/pi-perm/config.toml`。
初期設定は `workspace` で、編集を許可し、通信を禁止する。

| 名前 | 用途 |
|---|---|
| `:read-only` | pi-perm 標準の読み取り専用・通信禁止 |
| `workspace` | 編集可・通信禁止 |
| `workspace-network` | 編集可・registry.npmjs.org と api.github.com への通信を許可 |

pi-perm の組み込みプロファイルも選択画面に表示される。先頭の `:` はプロファイル名の一部。
設定ファイルに `permissions.<name>` と `profiles.<name>.description` を追加すれば、UI に表示される。
設定変更後は `/reload` を実行する。

pi-perm 0.1.8 が「project config」と呼ぶのは、パッケージルートの `config.toml`。
作業ディレクトリにある `.pi/config.toml` を自動的に読み込む実装ではない。

## ファイル構成

- `index.ts`：pi-perm のコアに Bash の `spawnHook` と `tool_call` を接続する。
- `ui.ts`：ショートカット、選択 UI、ステータス表示、引数補完を実装する。
- `patch-upstream.mjs`：修正対象を確認したうえで、バージョンを固定した pi-perm に2件の修正を適用する。
- `package-lock.json`：依存パッケージのバージョンを固定する。
- `test/`：UI と、実際の Linux サンドボックスを検証する。

## 再インストールと更新

```bash
cd ~/.pi/agent/extensions/pi-perm-ui
npm ci --ignore-scripts --legacy-peer-deps
node patch-upstream.mjs
npm test
```

Sandbox Runtime の CLI は、この拡張のローカル依存としてインストールしたものを絶対パスで呼び出す。
グローバルな npm インストールは不要。
Linux では `bwrap` / `socat` / `rg` が必要で、この環境では実行テスト済み。

pi-perm の内部 API を利用しているため、pi-perm のバージョンを更新する際は、コードの確認とテストを行うこと。

## 元の pi-perm に加えた修正

この拡張が利用する pi-perm 0.1.8 には、次の2件の修正を適用している。

1. 最新の smol-toml が返す null-prototype テーブルをpi-perm の `deepMerge` が受け付けず、設定のデフォルトが失われる問題を修正した。古い脆弱なパーサーへはダウングレードしない。
2. 元の pi-perm の `wrapCommandWithSrt` は元のコマンドを引用せずに連結するため、リダイレクト、パイプ、コマンド置換がサンドボックスの外で解釈される。コマンド全体を引用して `srt -c` に渡すよう修正した。

## セキュリティ上の注意点

Sandbox Runtime 0.0.79 が依存する node-forge には、RSA PKCS#1 v1.5 の署名検証に関する脆弱性 `GHSA-86w9-cpqp-85rv` がある。
`npm audit` では重要度 high の警告が残っており、監査結果上、修正版へ通常の更新で移行する経路はない。
安全性を保証した導入ではない。Sandbox Runtime と node-forge の修正状況を追うこと。

この拡張は Pi のプロセスや任意の拡張コードを丸ごと隔離するものではない。
主に `read` / `write` / `edit` の呼び出しを制御し、モデルが呼ぶ Bash を OS レベルのサンドボックスで実行する。
ユーザーが入力する `!` / `!!` は、元の pi-perm と同じく制御の対象外。
独自ツールや MCP には別途設定と検証が必要になる。

`ls` / `find` / `grep` は初期設定で確認対象にしているが、`read` / `write` / `edit` と同じパス判定の実装ではない。
Sandbox Runtime の `allowRead` を、読み取りを厳密に制限するホワイトリストとはみなさないこと。
作業領域の `.env` など、明示的に `deny` を指定したファイルの拒否は実テスト済み。
ただし、任意のパスルール、ネットワーク、シンボリックリンク、すべてのツールで制限の迂回を防げるかまでは検証していない。

## 検証記録

- UI：適用、キャンセル、実行中の切り替え拒否、全アクセスを許可する際の確認、スラッシュコマンドによる切り替えと補完を検証した。
- 実際の `srt`：作業領域内への書き込み成功、領域外への書き込み拒否、`.env` の読み取り拒否、`:read-only` での書き込み拒否を確認した。
- Pi RPC：拡張の読み込み、`pi-perm` コマンドの登録、ステータス通知を確認した。
- 実際の PTY：`Alt+A` の入力で選択画面が開き、`workspace-network` が表示されることを確認した。
