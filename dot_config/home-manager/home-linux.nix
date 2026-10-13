{ pkgs, ... }:
{
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
