# Chrome DevTools MCP for Pi

ブラウザ操作とフロントエンドのデバッグを行う、Linux x86_64 用ツールセットです。
`home-linux.nix` で選択し、Pi 標準 MCP に `chrome_devtools` として登録します。
macOS の Home Manager には追加しません。

## 構成と固定元

- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)：1.11.0。
  公式 npm 配布物を URL と SHA-256 で固定しています。配布物には Puppeteer、
  Lighthouse、MCP SDK などの実行依存がバンドルされています。
  参照リリースは `chrome-devtools-mcp-v1.11.0`
  （`a878bcad39584337e055778353246820deafa7c0`）。
- Google Chrome と Node.js 24：既存の `flake.lock` の Linux nixpkgs から供給。
  導入時の Chrome は 149.0.7827.102。単体ビルドも可能にするため、ブラウザの
  パッケージ集合では Google Chrome のみ unfree を許可しています。
- `package.nix`：固定済み実行ファイルを使う `pi-chrome-devtools-mcp` ラッパー。
  起動時の `npx`、npm install、ブラウザダウンロードはありません。
- `default.nix`：登録拡張、操作・安全指示の Skill、実行ラッパーを一つに構成。
  既存の権限拡張を経由して MCP ツールを呼び出します。

MCP 本体は Apache-2.0。バンドル内の LICENSE / THIRD_PARTY_NOTICES は固定配布物に保持します。
Google Chrome は Google の利用条件に従います。

## 使い方

適用後、Pi ランチャー経由で Pi を再起動し、`/mcp` で `chrome_devtools` の接続を確認します。
シェルの `pi mcp list` は登録拡張を読まないため、このサーバーの確認には使えません。
起動だけではブラウザを開かず、ブラウザが必要なツールを初めて呼び出すと開きます。

依頼の例：

> http://localhost:3000 を開き、保存ボタンが動かない問題を再現して。
> Console エラーと失敗した API リクエストを確認し、ソースコードと照合して原因を調べて。

専用の Chrome ウィンドウを表示します。WSL では WSLg と X11/Wayland の接続、
ブラウザのサンドボックスが動作する環境が必要です。
普段使いの Chrome、Windows 側 Chrome、既存のタブには接続しません。
Windows 側の開発サーバーへ WSL から接続する場合は、WSL のネットワーク設定により
`localhost` 以外の到達可能なホスト名/IP が必要になることがあります。

### ログイン状態

専用プロファイルは次に保存します。

```text
${XDG_DATA_HOME:-$HOME/.local/share}/pi/chrome-devtools/profile
```

サイトへのログイン・2FA は、このウィンドウで本人が手動で行います。
プロファイルは Git / Nix store / chezmoi の管理外です。
同じプロファイルを複数のブラウザ所有セッションで同時使用できません。
別の Pi に切り替えるときは所有している Pi を終了し、ブラウザを閉じてから接続します。
ロックファイルの削除や、無関係な Chrome の強制終了はしません。

## プライバシーと制限

次の設定を固定しています。

- MCP 利用統計を無効化：`--no-usage-statistics` と対応する環境変数。
- 性能計測での Google CrUX API への URL 送信を無効化：`--no-performance-crux`。
- npm の更新確認と、ユーザー/プロジェクトの MCP 設定ファイルの自動探索を無効化。
- 通信ヘッダーの一部をマスク：`--redact-network-headers`。
- MCP からの `file:` URL 遷移を無効化。既定のファイルアクセス範囲を維持し、
  `--allow-unrestricted-paths` や `--no-sandbox` は指定しません。

これは完全な通信遮断・秘密情報の除去・OS 隔離ではありません。
通常のサイト通信や Chrome 自身の通信は発生し得ます。
本文、Console、URL、レスポンス、スクリーンショットにも秘密情報は入り得ます。
モデルと会話履歴に渡る情報を確認し、購入・送信・削除・公開などは本人の許可を得ます。

React 等の専用 DevTools の代替ではありません。ブラウザ操作、Console、Network、
JavaScript、スクリーンショット、性能トレースをまず提供します。

## ビルド・検証・適用

管理元は `dot_config/home-manager/`、配置先は `~/.config/home-manager/` です。
管理元のディレクトリで：

```sh
nix build path:$PWD#pi-toolset-chrome-devtools \
  path:$PWD#checks.x86_64-linux.pi-chrome-devtools \
  path:$PWD#checks.x86_64-linux.pi-toolsets \
  path:$PWD#checks.x86_64-linux.pi-toolset-module --no-link -L
nix build path:$PWD#homeConfigurations.coura.activationPackage --no-link -L
```

登録検査は本物の Pi ローダーとラッパーの設定を確認します。
実ブラウザの検査は Nix sandbox の外で実行します。

```sh
toolset=$(nix build path:$PWD#pi-toolset-chrome-devtools --no-link --print-out-paths)
host=$(nix eval --raw path:$PWD#homeConfigurations.coura.config.programs.pi.package.outPath)
export CHROME_TOOLSET_ROOT="$toolset" PI_PACKAGE_DIR="$host/lib/pi"
node pi-toolsets/chrome-devtools/smoke-test.mjs
CHROME_SMOKE_HEADED=1 node pi-toolsets/chrome-devtools/smoke-test.mjs
```

検査はローカル HTTP サーバーと一時プロファイルだけを使います。
画面遷移、入力・クリック、構造取得、Console、HTTP 500、JavaScript 実行、
スクリーンショット、性能トレースを確認し、終了時にブラウザと一時ファイルを片付けます。
実アカウントには接続しません。
WSL2 / WSLg で headed / headless 両方の成功を確認しています。

適用前に旧世代と配置差分を確認してから：

```sh
home-manager generations
chezmoi diff ~/.config/home-manager
chezmoi apply ~/.config/home-manager
home-manager switch --flake ~/.config/home-manager#coura
```

問題があれば、控えた旧世代の `/nix/store/...-home-manager-generation/activate` で戻します。
次の switch で再適用しないよう、構成も戻してください。プロファイルは世代切替では消しません。

更新時は `package.nix` の版・ハッシュを更新し、公式の変更点と必要 Chrome 版を確認して
同じ検査を行います。Chrome の更新は nixpkgs の固定更新で行います。
