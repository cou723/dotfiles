{ pkgs }:
let source = (import ./sources.nix { inherit pkgs; }).yomiyasu;
in pkgs.runCommand "pi-yomiyasu-source" {} ''
  mkdir -p "$out/skills"
  cp -R ${source}/skills/yomiyasu "$out/skills/yomiyasu"
''
