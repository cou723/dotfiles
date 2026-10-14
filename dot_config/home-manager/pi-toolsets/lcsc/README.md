# LCSC 部品検索

グローバルに公開するのは `lcsc` Skill 一つだけ。MCP、Agents、KiCad 操作、
注文機能は追加しない。Python は既存の Pi ランチャーの PATH から供給する。

## 固定元と構成

- 候補検索：aklofas/kicad-happy commit
  `06840467ad0f5d76af45f64449b1f5ecb10f052f`、MIT。
  URL と展開済みソースの SHA-256 は `../../pi-skills/sources.nix` に固定。
- 上流の `search_lcsc.py` と、その import 先 `fetch_datasheet_lcsc.py` を同階層で保持。
  上流の LICENSE も同梱する。API キーと追加 Python ライブラリは不要。
- Skill 本文はローカルで用途を部品検索に限定。上流の KiCad BOM 同期など、
  他 Skill に依存するワークフローは公開しない。
- `detail_lcsc.py` は LCSC の直接応答を保持する小さなローカル補助。
  上流検索の stock / price_usd は主に JLCPCB 実装用で、LCSC 通販の値とは限らない。
  また上流詳細アダプターは paramVOList を取り込まないため、
  通販の価格・在庫・パラメーターには直接応答を使用する。

## データと副作用

候補検索は jlcsearch.tscircuit.com（コミュニティミラー）。
通販詳細は wmsc.lcsc.com の認証不要エンドポイント。
検索語・C 番号がそれぞれのサービスに送信される。読み取りのみで、
設計ファイル送信、カート変更、支払いは行わない。

API の稼働・応答形式、通販在庫、価格、パラメーターは Nix で固定できない。
公開エンドポイントは安定した公式 OpenAPI 契約ではなく、403 や形式変更が起き得る。
取得失敗・未取得値を「在庫 0」や「価格 0」として扱わない。
個数別単価は MOQ・梱包条件・通貨とセットで確認し、送料・税は別扱いとする。

## 検査と適用

`package.nix` のビルドで、直接応答の保持・在庫 0・API エラー・別部品応答・
不正な C 番号のオフライン検査と、同梱スクリプトの `--help` を実行する。
実 API の検査はビルドの外で少量の公開情報を取得する。

```sh
cd dot_config/home-manager
nix build .#pi-toolset-lcsc --no-link -L
nix build .#homeConfigurations.coura.activationPackage --no-link -L
```

Home Manager の適用は別操作。chezmoi 管理元の変更を適切に配置した後で実施し、
更新された Pi ランチャーで再起動する。ビルドだけでは現在の Pi に公開されない。
