{ pkgs }:
let source = (import ./sources.nix { inherit pkgs; }).explainer;
in pkgs.runCommand "pi-explainer-source" {} ''
  mkdir -p "$out/skills" "$out/upstream"
  cp -R ${source}/skills/. "$out/skills/"
  cp ${source}/package.json ${source}/package-lock.json "$out/upstream/"
  cp ${source}/LICENSE "$out/upstream/explainer-LICENSE"
  test "$(find "$out/skills" -name SKILL.md | wc -l)" -eq 5
''
