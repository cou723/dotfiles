{ pkgs, pi, ... }:
let
  toolsets = import ./pi-toolsets {
    inherit pkgs;
    piPackage = pi.packages.${pkgs.stdenv.hostPlatform.system}.default;
  };
in {
  programs.pi.toolsets = [ toolsets.chromeDevtools ];

  home.username = "coura";
  home.homeDirectory = "/home/coura";

  home.packages = with pkgs; [
    # ユーティリティ
    xclip
    ripgrep
    deno
    strace

    # 開発ツール
    ansible
    valgrind
    pkg-config
    readline
    libtool

    # JavaScript
    nodejs_24
    pnpm
  ];
}
