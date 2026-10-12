{ pkgs, piPackage }:
let
  lib = pkgs.lib;
  mkToolset = import ./mk-toolset.nix { inherit pkgs; };
  toolsets = import ./default.nix { inherit pkgs piPackage; };
  parent = mkToolset {
    name = "test-parent";
    source = ./management-skill;
    dependencies = [ toolsets.yomiyasu ];
  };
  collision = mkToolset {
    name = "test-collision";
    source = import ../pi-skills/yomiyasu.nix { inherit pkgs; };
    resources.skills = [ "yomiyasu" ];
  };
  # Evaluate the module contract without activation or user settings.
  evaluate = selected: lib.evalModules {
    modules = [
      ./home-module.nix
      ({ lib, ... }: {
        options = {
          home.file = lib.mkOption { type = lib.types.attrs; default = {}; };
          home.packages = lib.mkOption { type = lib.types.listOf lib.types.package; default = []; };
          assertions = lib.mkOption { type = lib.types.listOf lib.types.attrs; default = []; };
        };
      })
      { programs.pi = { enable = true; package = piPackage; toolsets = selected; }; }
    ];
    specialArgs = { inherit pkgs; };
  };
  todoist = (evaluate [ toolsets.todoist ]).config;
  chosen = (evaluate [ parent ]).config;
  empty = (evaluate []).config;
  bad = (evaluate [ toolsets.yomiyasu collision ]).config;
  inventory = builtins.fromJSON (builtins.unsafeDiscardStringContext chosen.home.file.".pi/agent/toolsets.json".text);
  launcher = builtins.head chosen.home.packages;
in
assert lib.all (a: a.assertion) todoist.assertions;
assert todoist.home.file ? ".pi/agent/skills/todoist";
assert todoist.home.file ? ".pi/agent/extensions/80-todoist-mcp.ts";
assert !(empty.home.file ? ".pi/agent/extensions/80-todoist-mcp.ts");
assert !(todoist.home.file ? ".pi/agent/mcp.json");
assert lib.all (a: a.assertion) chosen.assertions;
assert chosen.home.file ? ".pi/agent/skills/yomiyasu";
assert !(empty.home.file ? ".pi/agent/skills/yomiyasu");
assert !(chosen.home.file ? ".pi/agent/settings.json");
assert !(chosen.home.file ? ".pi/agent/auth.json");
assert builtins.length inventory == 2;
assert builtins.elem pkgs.python3 chosen.home.packages;
assert !(lib.all (a: a.assertion) bad.assertions);
pkgs.runCommand "pi-toolset-module-tests" {} ''
  grep -F '${pkgs.python3}/bin' ${launcher}/bin/pi
  ${launcher}/bin/pi --version | grep -E '^[0-9]+\.[0-9]+\.[0-9]+'
  touch "$out"
''
