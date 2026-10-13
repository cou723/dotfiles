# D2を既存のPiツールセットへ組み込む

D2 v0.9.0の公式配布バイナリをNixで固定し、`explainer` の実行依存として提供します。
TALAは同梱されています。別プラグイン、ライセンスキー、起動時のインストールは不要です。

## どこにつながるか

`default.nix` がこの `package.nix` を `runtimePackages` に渡し、既存の `home-module.nix` がユーザー環境への配置とPiランチャーのPATH設定を担当します。新しい依存リゾルバやHome Managerオプションは追加していません。

次の図は [runtime.d2](runtime.d2) のTALA端末描画です。矢印はパッケージ供給・環境への接続を表し、プロセス間通信ではありません。[事実シート](runtime.facts.json)は上記のNix定義を根拠にしています。

```text
    +-----------------+
    |D2 v0.9.0 + TALA |
    |                 |
    +-----------------+
             |
             v
+--------------------------+
|explainer runtimePackages |
|                          |
+--------------------------+
             |
             v
+---------------------------+
|Home Manager / pi launcher |
|                           |
+---------------------------+
             |
             v
      +--------------+
      |Pi tools / d2 |
      |              |
      +--------------+
```

## なぜ公式バイナリを使うか

公式v0.9.0のソースはGo 1.27を要求しますが、現在固定しているnixpkgsのGoは1.26までです。
D2のためにnixpkgs全体やコンパイラを更新せず、公式アーカイブのURL・版・SHA-256を `package.nix` で固定しました。ハッシュはGitHubの公開値と取得結果を照合しています。

これはソースからの再ビルドではなく、上流のビルド成果物を信頼してNixで配置を再現する方式です。将来、対応版がnixpkgsに入ったら通常のパッケージへの切り替えを検討できます。

対応する定義は `x86_64-linux` と `aarch64-darwin` です。Linuxはビルド・実行確認済み。macOSはアーカイブ取得・ハッシュ確認・Nix評価のみで、実機ビルド・実行は未検証です。

## ビルドと確認

```sh
cd ~/.config/home-manager
nix build .#pi-d2 .#pi-toolset-explainer --no-link -L
nix build .#checks.x86_64-linux.pi-toolsets \
  .#checks.x86_64-linux.pi-toolset-module --no-link -L
```

パッケージの `installCheckPhase` で、版、TALA同梱、最小図のSVG・ASCIIテキスト・PNG出力を確認します。v0.9.0のPNG描画は内蔵レンダラーを使い、Playwrightブラウザは不要です。

適用前に `home-manager generations` で旧世代のパスを記録し、対象外の未適用変更がないか確認してください。

```sh
home-manager switch --flake .#coura
~/.nix-profile/bin/d2 --version
~/.nix-profile/bin/d2 layout
```

問題があれば、記録した旧世代の `<generation-path>/activate` で環境を戻せます。次のswitchで再更新されないよう、構成の変更も別途戻してください。旧世代は検証が終わるまで削除しません。

Piは新しいランチャー経由で再起動してください。`/reload` だけでは起動済みプロセスのPATHは置き換わりません。古いD2が優先されるときは `command -v d2` で確認してください。

## 図の描画と事実チェック

このディレクトリで実行します。生成物はリポジトリに置かず、一時ディレクトリに出します。

```sh
d2 fmt --check runtime.d2
d2 validate runtime.d2
d2 --layout=tala --ascii-mode=standard runtime.d2 /tmp/pi-d2-runtime.txt
d2 --layout=tala runtime.d2 /tmp/pi-d2-runtime.svg
d2 --layout=tala runtime.d2 /tmp/pi-d2-runtime.png
node ~/.pi/agent/skills/d2-diagram/assets/d2-facts.mjs \
  --from-svg /tmp/pi-d2-runtime.svg --from-txt /tmp/pi-d2-runtime.txt \
  --expect runtime.facts.json
```

2026-10-14のLinux確認では、4箱・3辺の一致と端末幅29列を確認し、検査はエラー0でした。PNGも開いてラベルと矢印を確認しました。

## ここでは供給しないもの

D2本体とその内蔵描画を使えることは、説明スキル全体の検証完了とは別です。
`explainer` のHTML・図の詳細検査や `d2-slides` のページ検査には、引き続きプロジェクトの固定JS依存（vlmkit、Playwright等）と対応ブラウザが必要です。形式手法ツールやfresh-readerの全手順も、このD2更新では検証していません。
