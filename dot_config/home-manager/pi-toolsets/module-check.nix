{ pkgs }:
let
  lib = pkgs.lib;
  mkToolset = import ./mk-toolset.nix { inherit pkgs; };
  runtime = pkgs.writeShellScriptBin "fixture-runtime" ''echo runtime-ok'';
  host = pkgs.writeShellScriptBin "pi" ''exec fixture-runtime'';
  component = mkToolset {
    name = "fixture-component";
    source = pkgs.writeTextDir "extensions/fixture.js" "export default () => {};";
    resources.extensions = [ "fixture.js" ];
    runtimePackages = [ runtime ];
  };
  complete = mkToolset {
    name = "fixture-complete";
    source = pkgs.writeTextDir "skills/fixture/SKILL.md" ''
      ---
      name: fixture
      description: Test fixture
      ---
    '';
    resources.skills = [ "fixture" ];
    components = [ component ];
  };
  evaluate = selected: (lib.evalModules {
    modules = [
      ./home-module.nix
      ({ lib, ... }: {
        options = {
          home.file = lib.mkOption { type = lib.types.attrs; default = {}; };
          home.packages = lib.mkOption { type = lib.types.listOf lib.types.package; default = []; };
          assertions = lib.mkOption { type = lib.types.listOf lib.types.attrs; default = []; };
        };
      })
      { programs.pi = { enable = true; package = host; toolsets = selected; }; }
    ];
    specialArgs = { inherit pkgs; };
  }).config;
  chosen = evaluate [ complete ];
  empty = evaluate [];
  collision = evaluate [ complete component ];
  launcher = builtins.head chosen.home.packages;
in
# Only custom placement/launcher behaviour is tested, not the installed catalogue.
assert lib.all (a: a.assertion) chosen.assertions;
assert chosen.home.file.".pi/agent/extensions/fixture.js".source == "${complete}/extensions/fixture.js";
assert chosen.home.file ? ".pi/agent/skills/fixture";
assert !(empty.home.file ? ".pi/agent/skills/fixture");
assert !(chosen.home.file ? ".pi/agent/settings.json");
assert !(chosen.home.file ? ".pi/agent/auth.json");
assert !(chosen.home.file ? ".pi/agent/mcp.json");
assert builtins.elem runtime chosen.home.packages;
assert !(lib.all (a: a.assertion) collision.assertions);
pkgs.runCommand "pi-toolset-placement-check" {} ''
  test -e ${complete}/skills/fixture/SKILL.md
  test -e ${complete}/extensions/fixture.js
  ${launcher}/bin/pi | grep '^runtime-ok$'
  touch "$out"
''
