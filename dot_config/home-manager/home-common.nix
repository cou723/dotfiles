{ pkgs, pi, ... }:
let
  piPackage = pi.packages.${pkgs.stdenv.hostPlatform.system}.default;
  toolsets = import ./pi-toolsets { inherit pkgs piPackage; };
in
{
  imports = [ ./pi-toolsets/home-module.nix ];

  programs.pi = {
    enable = true;
    package = piPackage;
    toolsets = with toolsets; [
      permissions history askUserQuestion context7 yomiyasu explainer nixToolsets lcsc todoist gmail hasdataAmazon subagents gitWorkflow
    ];
  };

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
