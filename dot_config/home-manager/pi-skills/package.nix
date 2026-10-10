{ pkgs }:
let
  yomiyasu = pkgs.fetchzip {
    extension = "tar.gz";
    url = "https://codeload.github.com/nanaism/yomiyasu/tar.gz/373356eb874af5184962c88e925ea7eb58450318";
    hash = "sha256-UrScbstVNRPTu7mWPvR11xBgmR057PVUYouSyFv3/+k=";
  };
  explainer = pkgs.fetchzip {
    extension = "tar.gz";
    url = "https://codeload.github.com/mizchi/explainer/tar.gz/578defba7249fde5366689424ed6017f76b5598b";
    hash = "sha256-X28LASU60zC8Q/8asgAr2UWIMxjYsVPEvd/bTro3c4o=";
  };
in
pkgs.runCommand "pi-skills-yomiyasu-explainer" {} ''
  mkdir -p "$out/skills" "$out/upstream"
  # Keep scripts, references, assets and licenses intact, not just SKILL.md.
  cp -R ${yomiyasu}/skills/yomiyasu "$out/skills/yomiyasu"
  cp -R ${explainer}/skills/. "$out/skills/"
  # Preserve the upstream lockfile for optional project-local JS dependencies.
  cp ${explainer}/package.json ${explainer}/package-lock.json "$out/upstream/"
  cp ${explainer}/LICENSE "$out/upstream/explainer-LICENSE"
  test "$(find "$out/skills" -name SKILL.md | wc -l)" -eq 6
''
