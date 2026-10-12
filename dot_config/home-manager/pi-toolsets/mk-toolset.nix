{ pkgs }:
# nixpkgs の buildEnv で、必要な資産を含む完成パッケージを構成する。
# リソースと実行条件は集約済みなので、Home Manager で依存グラフをたどる必要はない。
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
  # 完成パッケージ用の manifest を生成するため、構成要素の manifest は取り込まない。
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
