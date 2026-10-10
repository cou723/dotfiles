{ config, pkgs, pi, ... }:
let
  conversationHistory = import ./pi-conversation-history/package.nix {
    inherit pkgs;
    piPackage = pi.packages.${pkgs.stdenv.hostPlatform.system}.default;
  };
  skills = import ./pi-skills/package.nix { inherit pkgs; };
  definedSubagents = if pkgs.stdenv.isLinux then import ./pi-defined-subagents/package.nix {
    inherit pkgs;
    piPackage = pi.packages.${pkgs.stdenv.hostPlatform.system}.default;
  } else null;
  askUserQuestion = import ./pi-ask-user-question/package.nix {
    inherit pkgs;
    piPackage = pi.packages.${pkgs.stdenv.hostPlatform.system}.default;
  };
in
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

    # Skill script runtimes, pinned by flake.lock (explainer requires Node 24+).
    python3
    nodejs_24
    d2

    # Python
    uv

    # JavaScript
    bun

    # ビルドツール
    gcc
    gnumake
  ];

  # Conversation-only navigation; never snapshots or restores workspace files.
  home.file.".pi/agent/extensions/30-conversation-undo.ts".source =
    "${conversationHistory}/extensions/30-conversation-undo.ts";
  home.file.".pi/agent/extensions/40-conversation-undo-tree.ts".source =
    "${conversationHistory}/extensions/40-conversation-undo-tree.ts";

  home.file.".pi/agent/extensions/50-ask-user-question.ts".source =
    "${askUserQuestion}/extensions/50-ask-user-question.ts";

  # The minimal per-worker OS boundary is Linux-only. Never silently run it unconfined on macOS.
  home.file.".pi/agent/extensions/60-defined-subagents.ts" = pkgs.lib.mkIf pkgs.stdenv.isLinux {
    source = "${definedSubagents}/extensions/60-defined-subagents.ts";
  };

  # Pi discovers these directories automatically; keep mutable settings.json alone.
  home.file.".pi/agent/skills/yomiyasu".source = "${skills}/skills/yomiyasu";
  home.file.".pi/agent/skills/explainer".source = "${skills}/skills/explainer";
  home.file.".pi/agent/skills/explainer-book".source = "${skills}/skills/explainer-book";
  home.file.".pi/agent/skills/first-reader".source = "${skills}/skills/first-reader";
  home.file.".pi/agent/skills/d2-diagram".source = "${skills}/skills/d2-diagram";
  home.file.".pi/agent/skills/d2-slides".source = "${skills}/skills/d2-slides";

  programs.direnv = {
    enable = true;
    nix-direnv.enable = true;
  };

  home.enableNixpkgsReleaseCheck = false;
  programs.home-manager.enable = true;
}
