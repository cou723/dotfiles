{ pkgs, pi, ... }:

{
  home.stateVersion = "24.11";
  nixpkgs.config.allowUnfree = true;

  home.packages = with pkgs; [
    # ユーティリティ
    curl
    delta
    wget
    zip
    unzip
    fzf
    eza
    zsh

    # 開発ツール
    gh
    ghq
    chezmoi
    pi.packages.${pkgs.stdenv.hostPlatform.system}.default

    # C/C++
    clang-tools
    gdb
    cmake

    # Rust
    rustup

    # Python
    uv

    # JavaScript
    bun

    # ビルドツール
    gcc
    gnumake
  ];

  programs.direnv = {
    enable = true;
    nix-direnv.enable = true;
  };

  home.enableNixpkgsReleaseCheck = false;
  programs.home-manager.enable = true;
}
