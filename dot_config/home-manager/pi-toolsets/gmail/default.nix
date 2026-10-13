{ pkgs }:
let
  mkToolset = import ../mk-toolset.nix { inherit pkgs; };
  source = pkgs.runCommand "pi-gmail-resources" {} ''
    mkdir -p "$out/extensions" "$out/skills/gmail"
    cp ${./extensions/85-gmail.ts} "$out/extensions/85-gmail.ts"
    cp ${./skills/gmail/SKILL.md} "$out/skills/gmail/SKILL.md"
  '';
in mkToolset {
  name = "pi-toolset-gmail";
  inherit source;
  resources = {
    extensions = [ "85-gmail.ts" ];
    skills = [ "gmail" ];
  };
  requirements = [
    "Google official remote MCP: https://gmailmcp.googleapis.com/mcp/v1. Remote implementation and schemas are not pinned by Nix; currently Developer Preview."
    "Join the Google Workspace Developer Preview Program and enable both Gmail API and Gmail MCP API in the OAuth client's Google Cloud project."
    "Create a Web application OAuth client with redirect URI http://127.0.0.1:8766/callback; save its downloaded JSON outside Git/Nix at ~/.config/pi-gmail/client_secret.json (or GMAIL_MCP_CLIENT_SECRET_PATH)."
    "Authenticate in interactive Pi with /mcp login gmail. OAuth tokens are managed by Pi, not Home Manager."
    "Scopes: gmail.readonly and gmail.compose. Compose includes sending permission at the token level, but Pi exposes only search/read/list/create_draft; send, label changes and unknown tools remain hidden."
  ];
}
