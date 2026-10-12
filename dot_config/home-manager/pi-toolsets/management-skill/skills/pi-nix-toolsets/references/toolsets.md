# パッケージの追加例

以下はこの Home Manager 構成独自の API。公式 Pi オプションではない。

## グローバルに選ぶ

固定ソースと runtimePackages を持つパッケージを pi-toolsets/default.nix に追加し、
home-common.nix の programs.pi.toolsets で選ぶ。既存 yomiyasu 定義が最小例。
ソース取得は固定 commit/version と hash を使う。固有のビルドは別 package.nix に置く。

mk-toolset.nix の入力：
- name：パッケージの一意名。
- source：skills/、extensions/、prompts/、themes/ を含む path/derivation。
- resources：自身が公開する相対パスのリスト（glob は使わない）。
- runtimePackages：Pi 起動環境に供給する Nix packages。
- components：組み込む他の mkToolset 出力。buildEnv が資産を合成し、公開リソース・実行環境・条件を完成物に集約する。
- requirements：供給していない実行条件。宣言だけで検査済みにはならない。

例：

```nix
myPackage = mkToolset {
  name = "pi-my-package";
  source = pinnedSource;
  resources.skills = [ "my-skill" ];
  components = [ requiredPiPackage ];
  runtimePackages = [ pkgs.python3 ];
};
```

出力は必要な資産が組み込まれた Pi package.json を持つ derivation。
passthru.piToolset は完成物の配置・実行環境情報。Home Manager は依存グラフをたどらない。
組み込み済み component を利用側で重ねて選ばない。共有 component を同時利用するなら、
一つの完成パッケージにまとめて選ぶ。循環したビルド依存を作らない。

## プロジェクト限定

固定された pkgs、piPackage、projectToolset があるとする。
完成パッケージは単体で読み込めるため、依存先の -e を追加する必要はない。

```nix
let
  projectPi = pkgs.writeShellScriptBin "project-pi" ''
    export PATH="${pkgs.lib.makeBinPath projectToolset.piToolset.runtimePackages}:$PATH"
    exec ${piPackage}/bin/pi -e ${projectToolset} "$@"
  '';
in pkgs.mkShell {
  packages = [ projectPi ] ++ projectToolset.piToolset.runtimePackages;
}
```

プロジェクトのルートで `nix develop` → `project-pi`。
このパッケージをグローバルにも配置しない。devShell はセキュリティ隔離ではなく、
ユーザーの Pi 資産も引き続き読み込まれる。

MCP はネイティブ登録拡張かプロジェクトの .pi/mcp.json を使う。ローカル server の
command は固定済み実行ファイルにする。既存設定や秘密を無断で上書きしない。

## ビルドと動作確認

```sh
nix build ~/.config/home-manager#checks.x86_64-linux.pi-toolsets --no-link -L
nix build ~/.config/home-manager#checks.x86_64-linux.pi-toolset-module --no-link -L
nix build ~/.config/home-manager#homeConfigurations.coura.activationPackage --no-link -L
```

カタログの追加でテストの件数・一覧は変更しない。独自の変換や実行処理がなければ、
新しい専用テストは不要。ビルドとは別に初回読み込み・必要な実行条件を確認する。
MCP は Pi 内の /mcp で登録・認証を確認してから、了承を得て無害な読み取りを行う。
