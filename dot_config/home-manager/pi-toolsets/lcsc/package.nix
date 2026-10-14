{ pkgs }:
let
  upstream = (import ../../pi-skills/sources.nix { inherit pkgs; }).kicadHappy;
in pkgs.runCommand "pi-lcsc-source" {
  nativeBuildInputs = [ pkgs.python3 ];
} ''
  mkdir -p "$out/skills/lcsc/scripts"
  cp ${./skills/lcsc/SKILL.md} "$out/skills/lcsc/SKILL.md"
  cp ${./skills/lcsc/scripts/detail_lcsc.py} "$out/skills/lcsc/scripts/detail_lcsc.py"
  cp ${upstream}/skills/lcsc/scripts/{search_lcsc,fetch_datasheet_lcsc}.py "$out/skills/lcsc/scripts/"
  cp ${upstream}/LICENSE "$out/skills/lcsc/LICENSE.kicad-happy"

  LCSC_SKILL_DIR="$out/skills/lcsc" python3 -B ${./test_detail.py}
  python3 -B "$out/skills/lcsc/scripts/search_lcsc.py" --help >/dev/null
  python3 -B "$out/skills/lcsc/scripts/detail_lcsc.py" --help >/dev/null
''
