{ pkgs }:
let
  mkToolset = import ../mk-toolset.nix { inherit pkgs; };
  # npm の公開物と、その唯一の実行時依存を個別に固定する。
  upstream = pkgs.fetchurl {
    url = "https://registry.npmjs.org/pi-cursor-provider/-/pi-cursor-provider-0.1.11.tgz";
    hash = "sha256-g6zkNjZCMafYWIQutNhBZKS6l+zhy5/YYSFtSug55AE=";
  };
  protobuf = pkgs.fetchurl {
    url = "https://registry.npmjs.org/@bufbuild/protobuf/-/protobuf-2.16.0.tgz";
    hash = "sha256-mfVw0vur0xYf03jGAu2XxUqO9YG+u8CVTmhSKku53zk=";
  };
  source = pkgs.runCommand "pi-cursor-provider-0.1.11-source" {} ''
    mkdir -p "$out/extensions/cursor/node_modules/@bufbuild/protobuf"
    tar -xzf ${upstream} --strip-components=1 -C "$out/extensions/cursor"
    tar -xzf ${protobuf} --strip-components=1 \
      -C "$out/extensions/cursor/node_modules/@bufbuild/protobuf"
    # ホスト提供の型を現在の Pi パッケージ名に合わせる。別の Pi は導入しない。
    substituteInPlace "$out/extensions/cursor/index.ts" \
      --replace-fail '@mariozechner/pi-coding-agent' '@earendil-works/pi-coding-agent' \
      --replace-fail '@mariozechner/pi-ai' '@earendil-works/pi-ai'
  '';
in mkToolset {
  name = "pi-toolset-cursor";
  inherit source;
  resources.extensions = [ "cursor" ];
  runtimePackages = [ pkgs.nodejs_24 ];
  requirements = [
    "Active Cursor subscription and browser-based /login cursor authentication. Tokens stay in Pi's mutable auth.json, never in Nix/store or Git."
    "Unofficial Cursor internal-protocol integration; network access to cursor.com and api2.cursor.sh is required. Upstream changes may break compatibility; plan limits and additional billing still apply."
    "PI_CURSOR_PROVIDER_DEBUG must remain disabled for normal use: upstream debug logs may contain prompts, tool arguments and provider payloads."
  ];
}
