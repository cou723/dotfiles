{
  description = "Home Manager configuration for macOS and Linux";

  inputs = {
    pi.url = "github:earendil-works/pi/stable";
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nixpkgs-linux.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    home-manager-linux = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs-linux";
    };
  };

  outputs = { nixpkgs, home-manager, nixpkgs-linux, home-manager-linux, pi, ... }: {
    packages.aarch64-darwin.default = home-manager.packages.aarch64-darwin.home-manager;
    packages.x86_64-linux.default = home-manager-linux.packages.x86_64-linux.home-manager;

    packages.x86_64-linux.pi-conversation-history = import ./pi-conversation-history/package.nix {
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      piPackage = pi.packages.x86_64-linux.default;
    };
    packages.aarch64-darwin.pi-conversation-history = import ./pi-conversation-history/package.nix {
      pkgs = nixpkgs.legacyPackages.aarch64-darwin;
      piPackage = pi.packages.aarch64-darwin.default;
    };

    packages.x86_64-linux.pi-ask-user-question = import ./pi-ask-user-question/package.nix {
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      piPackage = pi.packages.x86_64-linux.default;
    };
    packages.aarch64-darwin.pi-ask-user-question = import ./pi-ask-user-question/package.nix {
      pkgs = nixpkgs.legacyPackages.aarch64-darwin;
      piPackage = pi.packages.aarch64-darwin.default;
    };

    checks.x86_64-linux.pi-ask-user-question = let
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      piPackage = pi.packages.x86_64-linux.default;
      extension = import ./pi-ask-user-question/package.nix { inherit pkgs piPackage; };
    in pkgs.runCommand "pi-ask-user-question-tests" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
      export HOME="$TMPDIR/home"
      mkdir -p "$HOME"
      PI_PACKAGE_DIR=${piPackage}/lib/pi QUESTION_ROOT=${extension} \
        node ${./pi-ask-user-question/smoke-test.mjs}
      touch $out
    '';

    packages.x86_64-linux.pi-toolset-yomiyasu =
      (import ./pi-toolsets { pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
        piPackage = pi.packages.x86_64-linux.default; }).yomiyasu;
    packages.x86_64-linux.pi-toolset-explainer =
      (import ./pi-toolsets { pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
        piPackage = pi.packages.x86_64-linux.default; }).explainer;
    packages.x86_64-linux.pi-toolset-nix-management =
      (import ./pi-toolsets { pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
        piPackage = pi.packages.x86_64-linux.default; }).nixToolsets;
    packages.aarch64-darwin.pi-toolset-yomiyasu =
      (import ./pi-toolsets { pkgs = nixpkgs.legacyPackages.aarch64-darwin;
        piPackage = pi.packages.aarch64-darwin.default; }).yomiyasu;
    packages.aarch64-darwin.pi-toolset-explainer =
      (import ./pi-toolsets { pkgs = nixpkgs.legacyPackages.aarch64-darwin;
        piPackage = pi.packages.aarch64-darwin.default; }).explainer;
    packages.aarch64-darwin.pi-toolset-nix-management =
      (import ./pi-toolsets { pkgs = nixpkgs.legacyPackages.aarch64-darwin;
        piPackage = pi.packages.aarch64-darwin.default; }).nixToolsets;
    checks.x86_64-linux.pi-toolset-module = import ./pi-toolsets/module-check.nix {
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      piPackage = pi.packages.x86_64-linux.default;
    };
    checks.x86_64-linux.pi-toolsets = import ./pi-toolsets/check.nix {
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      piPackage = pi.packages.x86_64-linux.default;
    };

    packages.x86_64-linux.pi-skills = import ./pi-skills/package.nix {
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
    };
    packages.aarch64-darwin.pi-skills = import ./pi-skills/package.nix {
      pkgs = nixpkgs.legacyPackages.aarch64-darwin;
    };

    checks.x86_64-linux.pi-skills = let
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      skills = import ./pi-skills/package.nix { inherit pkgs; };
    in pkgs.runCommand "pi-skills-tests" { nativeBuildInputs = [ pkgs.nodejs_24 pkgs.python3 ]; } ''
      export PYTHONDONTWRITEBYTECODE=1
      export SKILLS_ROOT=${skills}/skills
      export PI_PACKAGE_DIR=${pi.packages.x86_64-linux.default}/lib/pi
      node ${./pi-skills/smoke-test.mjs}
      python3 ${skills}/skills/yomiyasu/scripts/yomiyasu_lint.py --help >/dev/null
      printf '設定を変更しました。\n' > before.txt
      cp before.txt after.txt
      python3 ${skills}/skills/yomiyasu/scripts/yomiyasu_lint.py before.txt --json > lint.json
      python3 ${skills}/skills/yomiyasu/scripts/yomiyasu_diff.py before.txt after.txt --json > diff.json
      python3 -c 'import json; json.load(open("lint.json")); json.load(open("diff.json"))'
      touch $out
    '';

    checks.x86_64-linux.pi-conversation-history = let
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      piPackage = pi.packages.x86_64-linux.default;
      extensions = import ./pi-conversation-history/package.nix { inherit pkgs piPackage; };
    in pkgs.runCommand "pi-conversation-history-tests" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
      export HOME="$TMPDIR/home"
      mkdir -p "$HOME"
      PI_PACKAGE_DIR=${piPackage}/lib/pi \
      HISTORY_ROOT=${extensions} \
        node ${./pi-conversation-history/smoke-test.mjs}
      touch $out
    '';

    packages.x86_64-linux.pi-permission-auto-review = import ./pi-permission-auto-review/package.nix {
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      piPackage = pi.packages.x86_64-linux.default;
    };
    packages.aarch64-darwin.pi-permission-auto-review = import ./pi-permission-auto-review/package.nix {
      pkgs = nixpkgs.legacyPackages.aarch64-darwin;
      piPackage = pi.packages.aarch64-darwin.default;
    };
    checks.x86_64-linux.pi-permission-auto-review = let
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      piPackage = pi.packages.x86_64-linux.default;
      extension = import ./pi-permission-auto-review/package.nix { inherit pkgs piPackage; };
    in pkgs.runCommand "pi-permission-auto-review-tests" { nativeBuildInputs = [ pkgs.nodejs_24 ]; } ''
      export HOME="$TMPDIR/home"
      mkdir -p "$HOME"
      PI_PACKAGE_DIR=${piPackage}/lib/pi REVIEW_ROOT=${extension} \
        POLICY_CONFIG=${./pi-permission-auto-review/permission-system.json} \
        REVIEW_CONFIG=${./pi-permission-auto-review/auto-review.json} \
        node ${./pi-permission-auto-review/smoke-test.mjs}
      touch $out
    '';

    packages.x86_64-linux.pi-context7 = import ./pi-context7/package.nix {
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      piPackage = pi.packages.x86_64-linux.default;
    };
    packages.aarch64-darwin.pi-context7 = import ./pi-context7/package.nix {
      pkgs = nixpkgs.legacyPackages.aarch64-darwin;
      piPackage = pi.packages.aarch64-darwin.default;
    };
    checks.x86_64-linux.pi-context7 = let
      pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
      piPackage = pi.packages.x86_64-linux.default;
      context7 = import ./pi-context7/package.nix { inherit pkgs piPackage; };
      permissionReview = import ./pi-permission-auto-review/package.nix { inherit pkgs piPackage; };
    in pkgs.runCommand "pi-context7-tests" { nativeBuildInputs = [ pkgs.nodejs_24 ]; } ''
      export HOME="$TMPDIR/home"
      mkdir -p "$HOME"
      PI_PACKAGE_DIR=${piPackage}/lib/pi CONTEXT7_ROOT=${context7} \
        REVIEW_ROOT=${permissionReview} \
        POLICY_CONFIG=${./pi-permission-auto-review/permission-system.json} \
        node ${./pi-context7/smoke-test.mjs}
      touch $out
    '';

    homeConfigurations = {
      "yuki.ueyama" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.aarch64-darwin;
        extraSpecialArgs = { inherit pi; };
        modules = [ ./home-common.nix ./home-darwin.nix ];
      };
      "coura" = home-manager-linux.lib.homeManagerConfiguration {
        pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
        extraSpecialArgs = { inherit pi; };
        modules = [ ./home-common.nix ./home-linux.nix ];
      };
    };
  };
}
