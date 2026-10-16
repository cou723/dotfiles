{ pkgs }:
let
  mkToolset = import ../mk-toolset.nix { inherit pkgs; };
  server = import ./package.nix { inherit pkgs; };
  source = pkgs.runCommand "pi-chrome-devtools-resources" {} ''
    mkdir -p "$out/extensions" "$out/skills/chrome-devtools"
    cp ${pkgs.writeText "84-chrome-devtools-mcp.ts" ''
      import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
      import { homedir } from "node:os";
      import { join } from "node:path";

      export default function (pi: ExtensionAPI): void {
        pi.registerMcpServer("chrome_devtools", {
          command: "${server}/bin/pi-chrome-devtools-mcp",
          args: ["--user-data-dir", join(
            process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
            "pi", "chrome-devtools", "profile",
          )],
          exposure: "codemode",
          timeout: 120,
          description: "Control a dedicated visible Chrome browser: navigate, click, fill, inspect console and network, take screenshots, and profile frontend performance. Use the chrome-devtools skill. Never attaches to your everyday browser.",
        });
      }
    ''} "$out/extensions/84-chrome-devtools-mcp.ts"
    cp ${./skills/chrome-devtools/SKILL.md} "$out/skills/chrome-devtools/SKILL.md"
  '';
in mkToolset {
  name = "pi-toolset-chrome-devtools";
  inherit source;
  resources = {
    extensions = [ "84-chrome-devtools-mcp.ts" ];
    skills = [ "chrome-devtools" ];
  };
  runtimePackages = [ server ];
  requirements = [
    "Linux x86_64 only: Nix-pinned Google Chrome and Node 24 are supplied through the server wrapper. Browser sandbox support and a working X11/Wayland display (WSLg on WSL) are required for headed operation."
    "Built-in Pi MCP enabled. No service API key required; site logins are performed manually in the dedicated browser."
    "Persistent private profile: $XDG_DATA_HOME/pi/chrome-devtools/profile (default ~/.local/share/pi/chrome-devtools/profile). Use only one active browser session per profile; close/restart the owning Pi before switching sessions."
    "Page content, console, URLs, response bodies and screenshots may reach the model and transcripts. Header redaction is partial, not a secret or prompt-injection sandbox. Purchases, sending, deletion and other consequential actions require user authorization."
  ];
}
