{ config, lib, pkgs, ... }:
let
  cfg = config.programs.pi;
  metadata = package: package.piToolset;
  selected = lib.unique cfg.toolsets;
  entries = lib.concatMap (package:
    lib.concatMap (kind: map (path: {
      name = ".pi/agent/${kind}/${path}";
      value.source = "${package}/${kind}/${path}";
    }) (metadata package).resources.${kind})
    [ "extensions" "skills" "prompts" "themes" ]) selected;
  destinations = map (entry: entry.name) entries;
  runtimePackages = lib.unique (lib.concatMap (package: (metadata package).runtimePackages) selected);
  inventory = map (package: {
    name = (metadata package).name;
    package = toString package;
    resources = (metadata package).resources;
    runtimePackages = map toString (metadata package).runtimePackages;
    requirements = (metadata package).requirements;
  }) selected;
  launcher = pkgs.writeShellScriptBin "pi" ''
    ${lib.optionalString (runtimePackages != []) ''export PATH="${lib.makeBinPath runtimePackages}:$PATH"''}
    exec ${cfg.package}/bin/pi "$@"
  '';
in {
  options.programs.pi = {
    enable = lib.mkEnableOption "the Nix-managed Pi toolset environment";
    package = lib.mkOption { type = lib.types.package; description = "Pinned Pi host package."; };
    toolsets = lib.mkOption {
      type = lib.types.listOf (lib.types.addCheck lib.types.package (p: p ? piToolset));
      default = [];
      description = "Toolsets made by pi-toolsets/mk-toolset.nix; not arbitrary derivations.";
    };
  };
  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = builtins.length destinations == builtins.length (lib.unique destinations);
        message = "Pi toolsets export colliding resource paths.";
      }
      {
        assertion = builtins.length selected == builtins.length
          (lib.unique (map (package: (metadata package).name) selected));
        message = "Pi toolset names must be unique.";
      }
    ];
    # Preserve mutable Pi settings, credentials, trust state and extension logs.
    home.file = builtins.listToAttrs entries // {
      ".pi/agent/toolsets.json".text = builtins.toJSON inventory;
    };
    home.packages = [ launcher ] ++ runtimePackages;
  };
}
