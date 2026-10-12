{ pkgs }:
# Compatibility output for existing pi-skills users/tests. New consumers select
# yomiyasu and explainer independently from pi-toolsets/default.nix.
let
  yomiyasu = import ./yomiyasu.nix { inherit pkgs; };
  explainer = import ./explainer.nix { inherit pkgs; };
in pkgs.runCommand "pi-skills-yomiyasu-explainer" {} ''
  mkdir -p "$out/skills"
  ln -s ${yomiyasu}/skills/yomiyasu "$out/skills/yomiyasu"
  for skill in ${explainer}/skills/*; do
    ln -s "$skill" "$out/skills/$(basename "$skill")"
  done
  ln -s ${explainer}/upstream "$out/upstream"
''
