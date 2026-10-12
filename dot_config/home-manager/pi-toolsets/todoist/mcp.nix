{ pkgs }:
let
  mkToolset = import ../mk-toolset.nix { inherit pkgs; };
  config = {
    url = "https://ai.todoist.net/mcp";
    exposure = "codemode";
    description = "Todoist account: find projects/tasks and create, update or complete tasks.";
  };
  source = pkgs.runCommand "pi-todoist-mcp-registration" {} ''
    mkdir -p "$out/extensions"
    cp ${pkgs.writeText "80-todoist-mcp.ts" ''
      import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
      export default function (pi: ExtensionAPI): void {
        pi.registerMcpServer("todoist", ${builtins.toJSON config});
      }
    ''} "$out/extensions/80-todoist-mcp.ts"
  '';
in mkToolset {
  name = "pi-toolset-todoist-mcp";
  inherit source;
  resources.extensions = [ "80-todoist-mcp.ts" ];
  requirements = [
    "Built-in Pi MCP enabled; authenticate interactively with /mcp login todoist."
    "Official remote service and OAuth scope data:read_write. Local registration is pinned, remote server implementation is not."
  ];
}
