---
name: commit-workflow
description: 現在の会話contextを維持したまま、依頼された変更だけを検証・stage・git commitする。commit、コミット、変更を記録、pnpmでの検証に使用。pushや外部投稿は含まない。
---

# Commit workflow

1. 現在のcontextで作業する。新sessionやsubagentへ無条件に委譲しない。
2. git status/diffを確認し、依頼対象とユーザーの既存変更を区別する。秘密情報をstageしない。
3. projectのAGENTS.md、package.json、既存scriptを読み、必要な検証をpnpmで実行する。未知のscriptは名前だけで安全と判断しない。
4. 検証の失敗を隠さない。認可Gateが拒否した場合、理由を踏まえ再計画し、迂回しない。
5. 明示的に依頼されたファイルだけをpath指定でstageする。git add -Aを無条件に使わない。
6. staged diffを再確認し、変更内容を表すmessageでcommitする。commitの依頼がないときは案を示すに留める。
7. commit hash、変更file、検証結果を報告する。push、amend、force pushは別の依頼・認可が必要。
8. 繰り返すproject固有の検証・commit手順が判明したら、skill_manageでproject scopeへ保存する。既存Skillを重複作成せず改善する。安定後にscript化を提案する。
