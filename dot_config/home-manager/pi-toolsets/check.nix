{ pkgs, piPackage }:
let toolsets = import ./default.nix { inherit pkgs piPackage; };
in
# カタログ内の全パッケージをビルドする。固定件数や Skill 一覧の手書き管理、
# 通信・OAuth・個別テストの登録は不要。公開パスの存在は mkToolset が確認する。
pkgs.linkFarm "pi-toolsets-build" (pkgs.lib.mapAttrsToList
  (name: path: { inherit name path; }) toolsets)
