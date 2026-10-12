{ pkgs }:
# Compose a complete Pi package with nixpkgs buildEnv. Home Manager does not
# traverse dependencies: resources and runtime requirements are already flattened.
{ name, source, resources ? {}, runtimePackages ? [], components ? [], requirements ? [] }:
let
  lib = pkgs.lib;
  kinds = [ "extensions" "skills" "prompts" "themes" ];
  ownResources = lib.genAttrs kinds (kind: resources.${kind} or []);
  exported = lib.genAttrs kinds (kind: lib.unique (
    ownResources.${kind} ++ lib.concatMap (p: p.piToolset.resources.${kind}) components
  ));
  runtimes = lib.unique (runtimePackages ++ lib.concatMap (p: p.piToolset.runtimePackages) components);
  conditions = lib.unique (requirements ++ lib.concatMap (p: p.piToolset.requirements) components);
  manifest = {
    inherit name;
    private = true;
    keywords = [ "pi-package" ];
    pi = lib.mapAttrs (kind: paths: map (path: "./${kind}/${path}") paths) exported;
  };
  metadata = {
    inherit name;
    components = map toString components;
    source = toString source;
    resources = exported;
    runtimePackages = map toString runtimes;
    requirements = conditions;
  };
in
assert lib.all (p: p ? piToolset) components;
assert lib.all (kind: builtins.elem kind kinds) (builtins.attrNames resources);
assert lib.all (path: path != "" && !(lib.hasPrefix "/" path)
  && lib.all (part: part != ".." && part != "") (lib.splitString "/" path))
  (lib.concatLists (builtins.attrValues ownResources));
pkgs.buildEnv {
  inherit name;
  paths = [ source ] ++ components;
  # Exclude component manifests; this complete package has its own manifest.
  pathsToLink = map (kind: "/${kind}") kinds ++ [ "/upstream" ];
  ignoreCollisions = false;
  passthru.piToolset = {
    inherit name;
    resources = exported;
    runtimePackages = runtimes;
    requirements = conditions;
  };
  postBuild = ''
    ${lib.concatMapStringsSep "\n" (kind:
      lib.concatMapStringsSep "\n" (path: ''test -e "$out/${kind}/${path}"'') exported.${kind}) kinds}
    cp ${pkgs.writeText "${name}-package.json" (builtins.toJSON manifest)} "$out/package.json"
    cp ${pkgs.writeText "${name}-toolset.json" (builtins.toJSON metadata)} "$out/toolset.json"
  '';
}
