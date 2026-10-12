---
name: pi-nix-toolsets
description: 外部の MCP、Skills、Hooks、Agents、Pi 拡張を Nix で固定し、依存を明示したツールセットとして導入・更新・削除するときに使う。Home Manager の Pi 環境とプロジェクト限定の環境を区別し、設定・実行依存・検査を一緒に管理する。
---

# Nix で Pi ツールセットを管理する

## 目的と管理単位

利用側は「どのセットを使うか」を宣言し、セット側はソース、実行依存、Pi リソース、未充足の実行条件、検査を持つ。単に再現可能なコピーを増やすのではなく、依存の成立条件をセットの近くに記録する。

密結合した MCP・Skill・Hook・Agent は一つのセットにする。共有される別セットへの依存は `dependencies = [ otherToolset ];` として明示する。Home Manager はその依存も推移的に配置する。プロジェクト用ランチャーを作る場合は、その依存のリソース・runtimePackages も自分で展開し、ルートだけ渡して完了としない。単に同じ devShell に列挙しただけで依存関係を表現したと言わない。循環したビルド依存を作らない。実行時の相互参照とビルド依存は区別する。

既存の Nix だけで足りる場合、APM/Renkei、Claude 互換層、新しいレジストリを勝手に追加しない。

## 最初に確認する

1. 対象リポジトリ、AGENTS.md、git status、flake.nix/lock、Home Manager と現在の Pi 設定を確認する。秘密情報は表示しない。
2. ユーザーに不足情報だけを聞く：配布元 URL、グローバルか特定プロジェクトか、必要な機能・認証、既存の Hooks/Subagents 基盤。質問はまとめる。
3. `~/.config/home-manager/pi-toolsets/` があれば、このローカル規約を使う。別環境では存在しないオプションを公式機能として説明しない。
4. Pi のインストール済み docs/packages.md、skills.md、mcp.md を読み、変更する API の関連文書も確認する。Hooks/Subagents を実装するなら extensions.md と該当バックエンドの文書を読む。Nix/API の不明点は最新ドキュメントを確認する。
5. ソースの README、manifest、Skill 本文、実行スクリプト、依存 lock を読む。インストールやネットワーク実行前に信頼と副作用を確認する。

## 依存表を先に作る

各セットについて記録する：

- ソース URL と固定コミット／バージョン、取得ハッシュ。
- 公開する extensions/skills/prompts/themes。
- ローカル MCP プログラムとそのビルド依存、または外部 HTTP の接続先。
- 呼び出すコマンドとランタイム（Python、Node、D2 等）。
- 必須の別セット、ツール名・入力出力などの互換条件。
- Hooks/Subagents の必要なバックエンドと、実際に使うイベント／機能。
- 秘密情報、外部サービス、ブラウザ、特定レイアウトなど実行時条件。
- 検証範囲：読込のみ／スクリプト実行／実 MCP 呼出／ワークフロー全体。

必須条件を `requirements` の文章に書くだけで解決済みにしない。供給できる依存は Nix の実行環境へ接続し、供給しない条件は検査と報告で未充足とする。オプション機能と必須機能を分ける。

## この環境の構成

- `pi-toolsets/mk-toolset.nix`：固定した資産から Pi package.json と toolset.json を生成。
- `pi-toolsets/default.nix`：セットごとの資産・実行依存・条件を宣言。
- `pi-toolsets/home-module.nix`：`programs.pi.toolsets` を Home Manager の配置、Pi ランチャー、ランタイム、一覧へ接続。
- `home-common.nix`：グローバルに使うセットを選択。
- `flake.nix`：公開パッケージと checks。

Pi package.json はリソースの公開仕様であり、MCP・Hooks・Agents の汎用依存解決仕様ではない。toolset.json はこの環境独自の情報で、Pi が自動解決するものではない。

## 取り込み方

### Skills / Prompts / Pi 拡張

固定した Nix ソースを `source` に渡し、resources と runtimePackages を宣言する。Skill は scripts/references/assets と相対配置を保持する。相互参照する sibling Skills はまとめる。

`runtimePackages` に書いたパッケージは Home Manager の環境と Pi ランチャーの PATH に接続される。buildInputs/nativeBuildInputs だけに置いて実行依存を解決したつもりにならない。Python/Node のライブラリも必要なら、その依存を持つ実行環境を作る。

拡張の Pi 提供モジュールを別バージョンで重複導入しない。既存 package.nix のホストモジュール接続方法を踏襲する。上流に適切な Pi package があれば再利用し、宣言の二重管理を避ける。

### MCP

原則 Pi 標準 MCP を使う。command と args は別々にし、Nix で完成した実行ファイルまたは固定された wrapper を使う。

- グローバルは `~/.pi/agent/mcp.json`、プロジェクトは `.pi/mcp.json`。
- この Home Manager モジュールは MCP 設定の生成・マージをまだ提供しない。必要なら明示的に追加し、既存設定との衝突・可変データを設計する。resources に架空の mcp キーを追加しない。
- `npx @latest`、未固定 uvx、起動時 git pull は使わない。Node/Python の固定だけではダウンロードされる MCP 本体は固定されない。
- command が裸の実行名なら、Pi を起動する Nix 環境の PATH にその実行ファイルを必ず供給する。強い固定が必要なら store の絶対パスを使う。
- トークンは環境変数参照や OAuth。Nix store、生成 JSON、ログ、Git に秘密を入れない。
- mcp.json を read-only にする場合、Pi の `/mcp` が状態を保存できない点を説明する。宣言を変更して再生成する方式か、管理対象キーだけを可変ファイルへ反映する方式を選ぶ。無断で可変設定全体を置換しない。
- プロジェクトへの接続範囲はセキュリティ隔離ではない。サーバーの権限・許可パスも制限する。
- HTTP サービスの URL 固定はサーバー実装のバージョン固定ではない。

### Hooks / Agents

Pi 標準 Skills の配置だけでは実行できない。選んだ Pi 拡張の仕様に変換するか、必要なら Pi ネイティブの実行処理を用意し、それをセットの依存にする。

Claude の設定ファイルを置いただけで互換としない。Hook イベント、stdin、戻り値、タイムアウト、Agent のツール・権限・モデル・fresh session の挙動を確認する。未対応は黙って落とさず報告する。保護 Hook の失敗時に許可へ倒れるかも検査する。

## 固定・スコープ・更新

Nix ソースは commit/version と hash で固定する。flake.lock だけでは fetchurl の URL や任意の起動時ダウンロードを固定しない。更新は明示的な変更として、影響するセットと checks を一緒に扱う。

グローバル導入は `programs.pi.toolsets` に追加する。プロジェクト限定なら home-common.nix に追加しない。プロジェクトの flake/devShell で runtimePackages を供給し、Pi のローカル package 設定または `pi -e <store-package>` で読み込む。MCP はプロジェクトの `.pi/mcp.json` に限定する。生成設定は既存のローカル設定と秘密を上書きしない。ユーザーがプロジェクトを trust することを勝手に省略しない。

同じセットを Home Manager の自動探索と package 設定/-e の両方から読み込むと重複する。どちらか一つにする。プロジェクト固有セットの例は references/toolsets.md を読む。

## 必須の検証と完了報告

1. Nix の評価・ビルド。該当プラットフォームを確認する。
2. 生成 manifest、resource の存在、名前衝突、依存の配置。
3. ピンした Pi の loader で Skills/拡張を検査。可能なら最小のスクリプト実行。
4. 必要な実行ファイルが Pi の環境で固定したものになること。
5. MCP は了承を得て `pi mcp list` と無害な実呼出。認証不足と仕様不一致は分ける。
6. Hooks/Agents は対象の挙動を再生。読み込み成功だけを動作成功と言わない。
7. セットを選ばない場合の配置・依存の除去を確認。他の用途が使う共有依存やユーザーの手置き資産は消さない。

既存の flake checks を壊さない。Home Manager の switch は設定変更の実適用である。依頼に適用が含まれるか確認し、実施前に旧世代へ戻す方法を示す。

報告には変更ファイル、固定元、宣言した依存、実行した検査、未検証条件、適用と `/reload` の要否を記す。認証・外部サービス・fresh subagent のテストを実施していないなら、その旨を明記する。
