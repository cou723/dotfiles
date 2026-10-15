# EasyEDA のプロジェクト用実行環境

共通 Nix で実行物を固定し、利用プロジェクトの `nix develop` → `project-pi` でだけ Skill を読み込む。
`programs.pi.toolsets` には追加しない。対応対象は WSL/Linux x86_64（glibc）。

## 固定元

- easyeda-copilot 1.3.1: `5d24d1ef17a4a3854253b1fb9cdf907d05e3f9eb`
- npm 依存: 上記の root `package-lock.json` と `npmDepsHash`
- backend 0.4.0、router 0.3.2、Sharp 0.35.0（lock に含まれる）
- KRT 0.22.0: 公式 zip と SHA-256（router の固定元と同じ）
- Node 24、Python＋NumPy/SciPy/Shapely、ngspice、Poppler: 共通 flake.lock の nixpkgs

Skill は上流の bundled 生成処理で作る。参照資料と runtime の相対配置を保ち、ライセンスを保持する。
CLI と配線エンジンは同じ実装を使う。拡張 `.eext` と Desktop は Nix 管理しない。

## 実行時の方針

- CLI と専用 Pi ランチャーは Nix の Python/KRT を絶対パスで供給する。
- router の `prepareKrtRuntime` に限定パッチを当て、引数による別 runtime 指定と実行時ダウンロードを無効にする。
  KRT が使えない場合に pip/Python を入れ直して成功したことにしない。Hybrid が部分的な代替結果を返す場合も、結果と DRC を別途確認する。
- Sharp は Skill の sibling スクリプトからも固定 node_modules を使う。ngspice と Poppler も供給する。
- libvips の prebuilt ELF に patchelf を当てると init が壊れて segfault したため、そのファイルは変更せず、consumer と backend のみ修正する。
- 実行時に必要な公開部品 API、データシート、任意の SPICE モデルデータはネットワーク取得する場合がある。データまで固定したという意味ではない。
- daemon 状態は既定で `~/.easyeda-copilot/cli`。成果物、ログ、モデルキャッシュは store 外。自動起動サービスは作らない。

## 手動の前提条件

Windows EasyEDA Pro Desktop と、同版の Copilot 拡張 **1.3.1**。
拡張の External Interactions とヘッダーメニュー表示を許可する。
Pi のモデル認証を利用し、legacy chat の API key 設定は今回の経路には不要。

この環境では Windows Desktop `3.2.206.715d940d` を確認し、Windows → WSL の
`127.0.0.1:8787` TCP 疎通を確認済み。上流 manifest は `^3.2.149`、主要検証版は 3.2.149。
**3.2.206 の実 WebSocket 接続、設計操作、DRC は未検証。**

Skill の限定読み込みはアクセス制御ではない。拡張は他の EasyEDA 文書にも操作能力を持つ。
対象 instance/document UUID を確認し、検証用文書から開始する。回路・配置・配線の許可範囲を区別する。

## 検査と更新

```sh
nix build ~/.config/home-manager#checks.x86_64-linux.pi-easyeda --no-link -L
```

検査は bundled metadata、PNG 生成、backend native load、KRT の startup/capability/patch、
不正 runtime の拒否、CLI daemon の start/status/schema/stop を確認する。Nix sandbox で実行し、
router のインストールキャッシュができないことも確認する。実 GUI の動作確認とは別。

更新時は commit/hash/npmDepsHash と限定パッチの対象を見直し、検査する。
アクティブな設計操作を終えて daemon を止め、手動の EasyEDA 拡張も同版へ更新する。
プロジェクトの lock は共通 flake の snapshot を持つため、共通設定の変更だけでは更新されない。
