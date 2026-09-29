{ pkgs, ... }:

let
  nodejs = pkgs.nodejs-slim_24;
  npmVersion = "12.0.2";
  npm = pkgs.runCommand "npm-${npmVersion}" {
    nativeBuildInputs = [ pkgs.makeWrapper nodejs ];
  } ''
    mkdir -p $out/lib/node_modules
    tar -xzf ${
      pkgs.fetchurl {
        url = "https://registry.npmjs.org/npm/-/npm-${npmVersion}.tgz";
        hash = "sha256-XbuGxx0HoZV/LpBzQJLdali9zZ68LY1ByhxuaiHTZOE=";
      }
    } -C $out/lib/node_modules
    mv $out/lib/node_modules/package $out/lib/node_modules/npm

    mkdir -p $out/bin
    makeWrapper ${nodejs}/bin/node $out/bin/npm \
      --add-flags "$out/lib/node_modules/npm/bin/npm-cli.js"
    makeWrapper ${nodejs}/bin/node $out/bin/npx \
      --add-flags "$out/lib/node_modules/npm/bin/npx-cli.js"
  '';
  nodejsWithNpm = pkgs.symlinkJoin {
    name = "nodejs-24-with-npm-${npmVersion}";
    paths = [
      nodejs
      npm
      nodejs.corepack
    ];
  };
in

{
  home.username = "yuki.ueyama";
  home.homeDirectory = "/Users/yuki.ueyama";
  home.stateVersion = "24.11";

  nixpkgs.config.allowUnfree = true;

  home.packages = with pkgs; [
    # macos
    vscode
    nerd-fonts.jetbrains-mono
    noto-fonts
    noto-fonts-cjk-sans
    noto-fonts-cjk-serif

    # ユーティリティ
    awscli2
    aws-vault

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
    claude-code
    colima
    docker
    docker-compose
    opencode

    # C/C++
    clang-tools
    gdb
    cmake

    # Rust
    rustup

    # Python
    uv

    # JavaScript
    # hariko-frontend の safe-chain-check が npm 最新版を要求するため、同梱 npm より新しい npm を明示的に提供する
    nodejsWithNpm
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
