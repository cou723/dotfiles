{ pkgs }:
let
  mkToolset = import ../mk-toolset.nix { inherit pkgs; };
  # Official connection contract reviewed at HasData/amazon-mcp commit
  # 5c05f99a0e6533a055a20aeac0d433b327c2f59f (MIT).
  # Pi speaks streamable HTTP directly; no npm/Python bridge is required.
  config = {
    url = "https://mcp.hasdata.com/mcp?apis=amazon";
    exposure = "codemode";
    description = "HasData Amazon: read public product search results, product details, seller profiles and seller catalogues. Tool calls consume HasData credits; no purchases or account changes.";
  };
  source = pkgs.runCommand "pi-hasdata-amazon-mcp-registration" {} ''
    mkdir -p "$out/extensions"
    cp ${pkgs.writeText "82-hasdata-amazon-mcp.ts" ''
      import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
      export default function (pi: ExtensionAPI): void {
        pi.registerMcpServer("hasdata-amazon", ${builtins.toJSON config});
      }
    ''} "$out/extensions/82-hasdata-amazon-mcp.ts"
  '';
in mkToolset {
  name = "pi-toolset-hasdata-amazon";
  inherit source;
  resources.extensions = [ "82-hasdata-amazon-mcp.ts" ];
  requirements = [
    "Built-in Pi MCP enabled; HasData account and browser OAuth via /mcp login hasdata-amazon (scope mcp:tools). No API key is embedded."
    "Network access to https://mcp.hasdata.com/mcp?apis=amazon. Local registration is pinned by Nix; remote implementation, tool schemas and pricing are not pinned."
    "Amazon tool calls consume HasData credits, including successful empty results. Confirm before diagnostic calls; listing tools/resources does not consume credits."
  ];
}
