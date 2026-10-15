{ pkgs }:
let
  packages = import ./package.nix { inherit pkgs; };
  mkToolset = import ../mk-toolset.nix { inherit pkgs; };
in mkToolset {
  name = "pi-toolset-easyeda";
  source = packages.runtime;
  resources.skills = [ "easyeda-copilot" ];
  runtimePackages = [ packages.cli pkgs.nodejs_24 pkgs.ngspice pkgs.poppler-utils ];
  requirements = [
    "Windows EasyEDA Pro Desktop and manually installed EasyEDA Copilot extension 1.3.1, with External Interactions enabled. Desktop 3.2.206 is not yet verified."
    "Windows-to-WSL localhost:8787 access; extension and CLI are not a project security sandbox. Select the exact instance/document before work."
    "Network access for public EasyEDA component APIs, datasheets and optional SPICE model data. Executable dependencies are supplied by Nix."
  ];
}
