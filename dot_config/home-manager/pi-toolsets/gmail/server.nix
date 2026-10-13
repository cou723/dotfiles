{ pkgs, source, pyproject-nix, uv2nix, pyproject-build-systems }:
let
  workspace = uv2nix.lib.workspace.loadWorkspace { workspaceRoot = source; };
  overlay = workspace.mkPyprojectOverlay { sourcePreference = "wheel"; };
  pythonSet = (pkgs.callPackage pyproject-nix.build.packages {
    python = pkgs.python313;
  }).overrideScope (pkgs.lib.composeManyExtensions [
    pyproject-build-systems.overlays.wheel
    overlay
    # v2.1.0's upstream uv.lock still calls the root project 2.0.1.
    # Only align derivation metadata; retain the upstream dependency lock.
    (_final: prev: {
      workspace-mcp = prev.workspace-mcp.overrideAttrs {
        version = "2.1.0";
        src = source;
      };
    })
  ]);
  environment = pythonSet.mkVirtualEnv "workspace-mcp-2.1.0-env" workspace.deps.default;
in environment.overrideAttrs (old: {
  passthru = (old.passthru or {}) // { upstreamSource = source; };
})
