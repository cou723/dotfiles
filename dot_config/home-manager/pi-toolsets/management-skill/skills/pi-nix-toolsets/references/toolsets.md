# ツールセットの追加例

以下はこの Home Manager 構成独自の API。公式 Pi オプションではない。

## グローバルに選ぶ

固定ソースと runtimePackages を持つセットを pi-toolsets/default.nix に追加し、
home-common.nix の programs.pi.toolsets で選ぶ。既存 yomiyasu 定義が最小例。
ソース取得は固定 commit/version と hash を使う。セット固有のビルドは別 package.nix に置く。

mk-toolset.nix の入力：
- name：セットの一意名。
- source：skills/、extensions/、prompts/、themes/ を含む path/derivation。
- resources：公開する相対パスのリスト（glob は使わない）。
- runtimePackages：Pi 起動環境に供給する Nix packages。
- dependencies：他の mkToolset 出力のリスト。Home Manager は推移的に選択・配置し、実行依存も供給する。
- requirements：自動解決されない実行条件。宣言しただけで検査済みにはならない。

出力は Pi package.json を持つ derivation。passthru.piToolset に配置・実行依存の
情報を持つ。MCP/Hooks/Agents の汎用 manifest ではない。

## プロジェクト限定（概念例）

すでに固定された pkgs、piPackage、projectToolset があるとする。
flake の devShells.<system>.default に、例えば次の shell を定義する：

```nix
let
  projectPi = pkgs.writeShellScriptBin "project-pi" ''
    exec ${piPackage}/bin/pi -e ${projectToolset} "$@"
  '';
in pkgs.mkShell {
  packages = [ projectPi ] ++ projectToolset.piToolset.runtimePackages;
}
```

プロジェクトのルートで `nix develop` → `project-pi`。
このセットをグローバルにも配置しないこと。プロジェクト外では project-pi を提供しない。
devShell はサンドボックスではなく、ユーザーの Pi 資産も引き続き読み込まれる。

MCP 設定を生成するなら、Nix で server の command を固定し、.pi/mcp.json を
明示的なセットアップ処理で反映する。この例自体は MCP 設定を生成しない。
実行のたびに無断で設定を書き換えない。既存設定を失わない設計にする。

## 検査

```sh
nix build ~/.config/home-manager#checks.x86_64-linux.pi-toolsets --no-link -L
nix build ~/.config/home-manager#checks.x86_64-linux.pi-skills --no-link -L
```

上記はローカル検査。ネットワーク接続・認証・MCP 実呼出・全 workflow を保証しない。
