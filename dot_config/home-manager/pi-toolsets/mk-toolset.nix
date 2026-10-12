{ pkgs }:
# This is a local Nix abstraction, not a Pi dependency-manager API.
{ name, source, resources ? {}, runtimePackages ? [], dependencies ? [], requirements ? [] }:
let
  lib = pkgs.lib;
  kinds = [ "extensions" "skills" "prompts" "themes" ];
  normalized = lib.genAttrs kinds (kind: resources.${kind} or []);
  manifest = {
    inherit name;
    private = true;
    keywords = [ "pi-package" ];
    pi = lib.mapAttrs (kind: paths: map (path: "./${kind}/${path}") paths) normalized;
  };
  metadata = {
    inherit name requirements;
    dependencies = map toString dependencies;
    resources = normalized;
    source = toString source;
    runtimePackages = map toString runtimePackages;
  };
in
assert lib.all (dependency: dependency ? piToolset) dependencies;
assert lib.all (kind: builtins.elem kind kinds) (builtins.attrNames resources);
assert lib.all (path: path != "" && !(lib.hasPrefix "/" path)
  && lib.all (part: part != ".." && part != "") (lib.splitString "/" path))
  (lib.concatLists (builtins.attrValues normalized));
pkgs.runCommand name {
  passthru.piToolset = { inherit name runtimePackages dependencies requirements; resources = normalized; };
} ''
  mkdir -p "$out"
  # Keep whole resource roots: siblings and non-exported support files may be required.
  ${lib.concatMapStringsSep "\n" (kind: ''
    if [ -e "${source}/${kind}" ]; then
      ln -s "${source}/${kind}" "$out/${kind}"
    fi
  '') kinds}
  ${lib.concatMapStringsSep "\n" (kind:
    lib.concatMapStringsSep "\n" (path: ''test -e "${source}/${kind}/${path}"'') normalized.${kind}) kinds}
  cp ${pkgs.writeText "${name}-package.json" (builtins.toJSON manifest)} "$out/package.json"
  cp ${pkgs.writeText "${name}-toolset.json" (builtins.toJSON metadata)} "$out/toolset.json"
  if [ -d "${source}/upstream" ]; then ln -s "${source}/upstream" "$out/upstream"; fi
''
