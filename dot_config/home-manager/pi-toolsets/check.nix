{ pkgs, piPackage }:
let toolsets = import ./default.nix { inherit pkgs piPackage; };
in
# Build every catalogue package. No fixed counts, hand-maintained Skill list,
# network, OAuth, or per-package test registration. mkToolset checks its exports.
pkgs.linkFarm "pi-toolsets-build" (pkgs.lib.mapAttrsToList
  (name: path: { inherit name path; }) toolsets)
