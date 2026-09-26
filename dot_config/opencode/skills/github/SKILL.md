---
name: github
description: GitHub 操作（リポジトリ・Issue・Pull Request・Actions・ユーザーの照会と管理）を依頼された際に使用するスキル。github MCP サーバー（GitHub 公式リモート MCP）と gh CLI で GitHub を操作する。
---

# github

`github` MCP サーバー（GitHub 公式のリモート MCP）と `gh` CLI を用いて GitHub を操作するスキルです。

## 反応する状況

- リポジトリ・コード・コミットの閲覧と検索
- Issue や Pull Request の作成・更新・管理
- GitHub Actions のワークフロー実行状況の確認とデバッグ
- ユーザー・チームの照会
- セキュリティアラート（Code Scanning、Dependabot）の確認

## 認証

`gh` CLI のトークンを `GITHUB_PERSONAL_ACCESS_TOKEN` 環境変数（`~/.zshrc` で自動エクスポート済み）として Bearer 認証に使用します。
401 エラーで失敗したら、`gh auth status` でログイン状態を確認し、環境変数がセットされた状態で opencode を起動しているか確認してください。

## MCP と gh CLI の使い分け

- **github MCP**: 構造化された照会・操作（ユーザー情報、リポジトリ・ファイルの取得、Issue/PR の読み書き、Actions 実行の確認など）に適する
- **gh CLI**: git 系の流れ（clone・push、PR 作成、checks 確認など）に適する。`gh auth status` でログイン状態を確認できる

## 主なツール（デフォルト toolset）

- `context`: 現在ユーザー情報（`get_me`）
- `repos`: リポジトリ・ファイルの取得（`get_repository_tree`, `get_file_contents` など）
- `issues`: Issue の読み書き
- `pull_requests`: Pull Request の読み書き
- `users`: ユーザーの照会

`actions`、`notifications`、`discussions`、セキュリティ系の toolset はリモートサーバー側の設定で追加可能。

## 注意事項

- GitHub MCP サーバーはツール数が多く context を消費するため、必要なツールのみを呼び出す
- リモートへの push、PR 作成、マージなどの破壊的・公開的な操作はユーザーの明示的な指示がある場合のみ行う
