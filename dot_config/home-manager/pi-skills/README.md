# Pi Skills の Home Manager 構成

現在の環境では、`programs.pi.toolsets` で yomiyasu と explainer を個別に選択します。[ツールセットの説明](../pi-toolsets/README.md)を参照してください。
ソースの固定情報は `sources.nix` にあり、`yomiyasu.nix` と `explainer.nix` がそれぞれの資産を構築します。
利用する公開出力は `pi-toolset-yomiyasu` と `pi-toolset-explainer` です。

`sources.nix` は GitHub のコミット ID と、展開後の SHA-256 ハッシュを固定します。
`flake.lock` は nixpkgs、Home Manager、Pi を固定します。構成のコピーやバックアップでは、このディレクトリ、`flake.nix`、Home Manager モジュールと一緒に保存してください。
`pi install`、`npx ...@latest`、可変な Git チェックアウト、起動時のダウンロードは使いません。

| ソース | コミット | 導入する Skills |
| --- | --- | --- |
| nanaism/yomiyasu | `373356eb874af5184962c88e925ea7eb58450318` | yomiyasu |
| mizchi/explainer | `578defba7249fde5366689424ed6017f76b5598b` | explainer, explainer-book, first-reader, d2-diagram, d2-slides |

上流の Skill ディレクトリ全体を、スクリプト・参照資料・資産・ライセンスを含めて、変更せず Nix store に保持します。
Home Manager は各 Skill を `~/.pi/agent/skills/` にリンクします。既存の Pi 設定と認証ファイルは変更しません。
Python 3、Node.js 24、D2 は、固定した nixpkgs リビジョンから提供します。
`coura`（Linux）と `yuki.ueyama`（macOS）は、同じ共通モジュールを使います。

## 適用と検査

```sh
home-manager switch --flake ~/.config/home-manager#coura
nix build ~/.config/home-manager#checks.x86_64-linux.pi-toolsets --no-link -L
```

macOS の適用では `#yuki.ueyama` を使ってください。
Darwin の評価は確認済みですが、Linux ホスト上では Darwin のビルドを行っていません。

Pi 内で `/reload` するか再起動してから、`/skill:yomiyasu` または `/skill:explainer` を実行してください。
`pi-toolsets` は yomiyasu・explainer を含む現行カタログをビルドし、宣言した公開リソースの存在を確認します。
ビルド成功は、Skill の全手順や explainer の全ツールの動作を保証しません。

## explainer の追加依存

Skill の導入と、文書の描画・ブラウザ・モデル検査・subagent の実行環境をすべて整えることは別です。
指示文を使う基本的な利用に npm インストールは不要です。
起動済みのシェルや Pi では、別の Node バージョンが PATH の先頭にある場合があります。
`switch` 後はツールセットの Pi ランチャーが、宣言した実行時パッケージのコマンドパスを PATH の先頭に加えます。そのランチャー経由で Pi を再起動してください。
Pi の bash 環境内で `node --version` を確認してください。

上流の explainer スクリプトは、多くの JS 依存を Skill ディレクトリではなく、**文書を作るプロジェクト**から解決します。
依存の再現性が必要な場合は、バージョン未指定の `npm i -D ...` の例をそのまま実行しないでください。

パッケージは上流の `package.json` と `package-lock.json` を `upstream/` に保持しています。
文書作成用の新規プロジェクトでは、これらを固定された依存構成の出発点にできます。

```sh
skills=$(nix build ~/.config/home-manager#pi-toolset-explainer --no-link --print-out-paths)
# 新規プロジェクトで実行する。既存プロジェクトの manifest は上書きしない。
cp "$skills/upstream/package.json" "$skills/upstream/package-lock.json" .
chmod u+w package.json package-lock.json
PATH="$HOME/.nix-profile/bin:$PATH" PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --ignore-scripts
```

プロジェクトのマニフェストをコミットし、以後は `npm install` ではなく `npm ci` を使ってください。
この任意の npm セットアップにはレジストリへのアクセスが必要で、サンドボックス内の Nix 依存ビルドではありません。
ライフサイクルスクリプトを実行しないため、追加ツールには別途セットアップが必要になる場合があります。
Playwright のブラウザは固定した Playwright バージョンに合わせ、Nix またはブラウザの構成を別途用意する必要があります。
ブラウザの互換性や HTML・図の描画は、ここでは検査していません。

first-reader が使う TALA、TLC/Apalache、fresh subagent の実行環境も追加機能で、導入・設定していません。
Nix の D2 パッケージだけでは TALA は含まれません。適切な subagent 連携がない場合は、first-reader の fresh subagent を使う検査を実施済みと報告しないでください。

## 明示的な更新

上流の変更を確認し、`sources.nix` のコミット ID を置き換えます。
`nix store prefetch-file --json --unpack <archive-url>` で新しいハッシュを取得し、上記の検査を実行してから Home Manager を適用してください。
通常の `switch` で Skill のリビジョンが進むことはありません。実行環境やツールチェーンを変える場合に限り、`flake.lock` を別途更新してください。
