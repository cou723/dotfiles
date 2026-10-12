---
name: pi-nix-toolsets
description: 外部の MCP、Skills、Hooks、Agents、Pi 拡張を Nix で固定し、依存を明示した完成パッケージとして導入・更新・削除するときに使う。Home Manager の Pi 環境とプロジェクト限定の環境を区別し、配置・実行環境・初回接続を確認する。
---

# Nix で Pi ツールセットを管理する

## 原則

利用側は使う完成パッケージを選び、パッケージ側は固定ソース・Pi リソース・実行環境を構成する。
依存する資産は Nix の構築時に組み込む。環境側に別の依存リゾルバを作らない。
密結合した MCP・Skill・Hook・Agent はまとめる。既存の Nix で足りるなら、
APM/Renkei、Claude 互換層、新しいレジストリを勝手に追加しない。

## 最初に確認する

1. 対象リポジトリ、AGENTS.md、git status、flake.nix/lock、Home Manager と Pi 設定を確認する。秘密は表示しない。
2. chezmoi 等を使う場合は配置先と Git 管理元を区別する。管理元を正本とし、別作業の変更を巻き込まない。
3. 不足情報だけをまとめて聞く：配布元、グローバルかプロジェクト限定か、認証、必要な Hooks/Subagents 基盤。
4. Pi のインストール済み docs/packages.md、skills.md、mcp.md と、変更する API の文書を読む。
5. ソースの README、manifest、Skill 本文、スクリプト、lock を読み、信頼性・副作用・ライセンスを確認する。

## 依存と未充足条件

各パッケージについて、固定 URL/commit/version/hash、公開資産、呼び出すコマンド、
必要な別資産、秘密情報、外部サービス、ブラウザ、実行バックエンドを整理する。
供給できる依存は Nix の参照・完成物・実行ラッパーに接続する。供給しない条件は
requirements に記録し、未充足と報告する。必須条件とオプション機能を分ける。
HTTP URL の固定はリモート実装やツールスキーマの固定ではない。

## この環境の構成

- pi-toolsets/mk-toolset.nix：buildEnv で資産を合成し、完成物の package.json/toolset.json を生成。
- pi-toolsets/default.nix：資産・components・runtimePackages・requirements を宣言。
- pi-toolsets/home-module.nix：選ばれた完成物を配置し、Pi ランチャーと実行環境を提供。
- home-common.nix：グローバルで使う完成物を選択。
- flake.nix：公開パッケージ、カタログのビルド、少量の共通配置検査。

これらはローカル規約で、公式 Pi/Home Manager API ではない。toolset.json は情報用で、
Pi が依存解決する manifest ではない。追加例は references/toolsets.md を読む。

## パッケージ化

固定ソースを source に渡し、自身の resources と runtimePackages を宣言する。
他の Pi 資産が必要なら components に完成パッケージを渡す。リソースと実行条件は
構成時に集約されるため、Home Manager やプロジェクトで依存先を展開し直さない。
組み込み済み component を利用側で重ねて選ばない。共有資産が衝突する場合は、
一つの完成物にまとめる。循環したビルド依存は作らない。

Skill の scripts/references/assets と相対配置を保持する。既存の Pi package を再利用し、
ホスト提供モジュールを別バージョンで重複導入しない。
runtimePackages は Pi ランチャーの PATH に接続される。buildInputs だけで実行依存を
満たしたつもりにならない。必要な Python/Node ライブラリも固定した環境へ組み込む。

### MCP

Pi 標準 MCP の登録拡張か、グローバル ~/.pi/agent/mcp.json／プロジェクト .pi/mcp.json を使う。
このモジュールは mcp.json の生成・マージをしない。必要なら既存設定との衝突を設計する。
command と args は分け、Nix で完成した実行ファイルまたはラッパーを使う。
未固定の npx/uvx、@latest、起動時 git pull は使わない。
秘密は環境変数参照や OAuth に置き、Nix store・生成 JSON・ログ・Git に入れない。
read-only の mcp.json は /mcp による保存を制限する。登録拡張の状態確認・認証には
Pi 内の /mcp を使う。shell の pi mcp は拡張登録サーバーを読み込まない。

### Hooks / Agents

具体的な Pi 実行バックエンドへ接続する。Claude 設定を置いただけで互換としない。
イベント、入出力、終了コード、タイムアウト、権限、fresh session を確認する。
保護処理の失敗時に許可へ倒れないか等、独自の実行処理には焦点を絞った検査を置く。

## スコープ・更新・確認

グローバルは programs.pi.toolsets、プロジェクト限定は flake/devShell と -e を使う。
同じ資産を自動探索と package 設定/-e の両方で登録しない。devShell は隔離ではない。
commit/version と hash を固定する。flake.lock だけでは起動時ダウンロードを固定しない。

1. Nix の評価・ビルドと、生成物・実行環境を確認する。プラットフォームを明記する。
2. 単純な資産追加に専用テストや固定件数・全資産の手書き一覧を追加しない。独自の変換・分岐・実行処理がある場合だけ、意味のある検査を検討する。
3. 初回利用や大きな更新では Pi で読み込みを確認する。読み込み成功と全 workflow の動作成功を区別する。
4. MCP は登録 → 本人の認証 → 了承を得た少量の読み取りを別々に確認する。実アカウントの作成・更新・完了を診断目的で行わない。
5. 適用は別操作。依頼の範囲を確認し、switch 前に旧世代への戻し方を示す。秘密・可変設定・手置き資産は消さない。

完了時は変更ファイル、固定元、組み込んだ依存、実施した確認、未検証条件、適用の有無を報告する。
適用後の PATH 更新にはランチャー経由の再起動が必要で、/reload だけでは反映されない。
