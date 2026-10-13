{ pkgs }:
let
  lib = pkgs.lib;
  mkToolset = import ./mk-toolset.nix { inherit pkgs; };
  runtime = pkgs.writeShellScriptBin "fixture-runtime" ''echo runtime-ok'';
  host = pkgs.writeShellScriptBin "pi" ''exec fixture-runtime'';
  component = mkToolset {
    name = "fixture-component";
    source = pkgs.runCommand "fixture-assets" {} ''
      mkdir -p "$out/extensions" "$out/agents"
      echo 'export default () => {};' > "$out/extensions/fixture.js"
      printf '%s\n' '---' 'name: fixture-agent' 'description: Test fixture' '---' > "$out/agents/fixture-agent.md"
    '';
    resources = {
      extensions = [ "fixture.js" ];
      agents = [ "fixture-agent.md" ];
    };
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
# 導入するパッケージ一覧ではなく、独自の配置処理とランチャーの挙動だけを検査する。
assert lib.all (a: a.assertion) chosen.assertions;
assert chosen.home.file.".pi/agent/extensions/fixture.js".source == "${complete}/extensions/fixture.js";
assert chosen.home.file ? ".pi/agent/skills/fixture";
assert chosen.home.file.".pi/agent/agents/fixture-agent.md".source == "${complete}/agents/fixture-agent.md";
assert !(empty.home.file ? ".pi/agent/agents/fixture-agent.md");
assert !(empty.home.file ? ".pi/agent/skills/fixture");
assert !(chosen.home.file ? ".pi/agent/settings.json");
assert !(chosen.home.file ? ".pi/agent/auth.json");
assert !(chosen.home.file ? ".pi/agent/mcp.json");
assert builtins.elem runtime chosen.home.packages;
assert !(lib.all (a: a.assertion) collision.assertions);
pkgs.runCommand "pi-toolset-placement-check" {} ''
  test -e ${complete}/skills/fixture/SKILL.md
  test -e ${complete}/extensions/fixture.js
  test -e ${complete}/agents/fixture-agent.md
  ${pkgs.jq}/bin/jq -e '."pi-subagents".agents == ["./agents"] and (.pi | has("agents") | not)' ${complete}/package.json
  ${launcher}/bin/pi | grep '^runtime-ok$'
  touch "$out"
''
