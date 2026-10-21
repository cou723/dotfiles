# Cursor subscription provider

非公式の [ndraiman/pi-cursor-provider](https://github.com/ndraiman/pi-cursor-provider)
をグローバルの Pi に追加する。Cursor Agent CLI のラッパーではなく、
ローカルの OpenAI 互換プロキシから Cursor の内部プロトコルへ変換し、
ツールは Pi 側で実行する。

## 固定と実行環境

- `pi-cursor-provider` 0.1.11（MIT）の npm tarball を SHA-256 で固定。
- 唯一の実行時依存 `@bufbuild/protobuf` 2.16.0（Apache-2.0）も tarball と SHA-256 で固定。
- HTTP/2 ブリッジが呼ぶ Node.js 24 を Pi ランチャーの PATH に供給。
- Pi の型 import のみ現在の `@earendil-works` 名へ置換。別の Pi 本体や npm peer dependencies は導入しない。
- 起動時の npm install やソース更新は行わない。

## 初回利用

Home Manager を適用後、Pi をランチャー経由で再起動する。
`/login` で **Cursor** を選ぶ（`/login cursor`）。ブラウザで本人が認証し、
`/model` から `cursor` のモデルを選ぶ。既定モデルは変更しない。
認証情報は Pi の可変な `~/.pi/agent/auth.json` に保存され、Nix/Git には含めない。

利用には Cursor サブスクリプションと `cursor.com` / `api2.cursor.sh` への通信が必要。
組み込みモデル一覧はフォールバックであり、一覧表示だけではアカウントの利用可否や
課金条件を確認したことにはならない。ログイン時・トークン更新時にモデルを取得する。

## 制約

公式サポートの連携ではない。Cursor の内部 API の変更で動かなくなる可能性があり、
規約への適合性・プランの利用枠・追加課金条件は利用者側で確認する。
Pi のコスト表示を Cursor の確定請求額として扱わない。

上流実装は拡張ロード時にループバックのランダムポートでプロキシを起動する。
外部公開せず、認証前にモデル要求は送らないが、ローカルの他プロセスに対する隔離ではない。
`PI_CURSOR_PROVIDER_DEBUG` は通常有効にしない。上流のデバッグログには
プロンプト・ツール引数・プロバイダのペイロード等が含まれ得る。

パッケージの読み込み確認と、本人のログイン後の応答・ツール実行確認は別工程とする。
