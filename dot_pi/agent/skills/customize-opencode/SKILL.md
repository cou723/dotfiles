---
name: customize-opencode
description: OpenCode のグローバル設定とプロジェクト設定の編集・作成専用スキル。ユーザーのアプリケーションコード編集には使用しない。
---

# customize-opencode

OpenCode のグローバル設定とプロジェクト設定の編集・作成専用スキルです。

## 配置

- グローバル設定は `~/.config/opencode/` に配置する
- プロジェクト設定はプロジェクト直下の `opencode.json`、`opencode.jsonc`、または `.opencode/` に配置する
- Agent、Command、Skill、Plugin などのグローバルなカスタマイズも `~/.config/opencode/` の対応するサブディレクトリに配置する
- `~/.opencode/` は OpenCode 本体のインストール先であり、カスタマイズの配置先として使用しない
- `OPENCODE_CONFIG_DIR` が設定されている場合は、そのディレクトリをグローバル設定の基準にする

## 対象タスク

以下の設定ファイルの編集・作成に使用してください:
- `opencode.json` / `opencode.jsonc`
- `tui.json` / `tui.jsonc`
- `.opencode/` 配下のプロジェクト設定
- `~/.config/opencode/` 配下のグローバル設定

## 対象外タスク

以下のタスクには使用しないでください:
- ユーザーのアプリケーションコード編集
- プロジェクト内の`.shape.ts`などの編集
- 通常のコード変更

## 注意事項

- 設定ファイルの編集時のみこのスキルを使用
- 設定の整合性を確認すること
- グローバル設定を `~/.opencode/` に作成しないこと
- JSONC形式（コメント記述可能）を推奨

## 参考情報

- [公式ドキュメント](https://opencode.ai/docs/ja/config/)
- [opencode.json/jsonc スキーマ](https://opencode.ai/opencode.json)
- [tui.json スキーマ](https://opencode.ai/tui.json)
