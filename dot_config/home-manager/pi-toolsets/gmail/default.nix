{ pkgs, workspaceMcp }:
let
  mkToolset = import ../mk-toolset.nix { inherit pkgs; };
  launcher = pkgs.writeShellApplication {
    name = "pi-gmail-mcp";
    runtimeInputs = [ pkgs.coreutils ];
    text = ''
      umask 077
      config_dir="''${XDG_CONFIG_HOME:-$HOME/.config}/workspace-mcp"
      state_dir="''${XDG_STATE_HOME:-$HOME/.local/state}/pi-gmail-mcp"
      mkdir -p "$state_dir/credentials"
      export GOOGLE_CLIENT_SECRET_PATH="''${GOOGLE_CLIENT_SECRET_PATH:-$config_dir/client_secret.json}"
      export WORKSPACE_MCP_CREDENTIALS_DIR="$state_dir/credentials"
      export MCP_ENABLE_OAUTH21=false
      # Do not inherit a project's .env or write attachments into a worktree.
      cd "$state_dir"
      exec ${workspaceMcp}/bin/workspace-mcp --transport stdio --single-user \
        --permissions gmail:send --tool-tier complete \
        --disabled-tools modify_gmail_message_labels batch_modify_gmail_message_labels \
          manage_gmail_label manage_gmail_filter "$@"
    '';
  };
  registration = pkgs.replaceVars ./extensions/85-gmail.ts {
    gmailCommand = "${launcher}/bin/pi-gmail-mcp";
  };
  source = pkgs.runCommand "pi-gmail-resources" {} ''
    mkdir -p "$out/extensions" "$out/skills/gmail/references/upstream"
    cp ${registration} "$out/extensions/85-gmail.ts"
    cp ${./skills/gmail/SKILL.md} "$out/skills/gmail/SKILL.md"
    # Preserve the upstream Skill's relative references and MIT attribution.
    cp -r ${workspaceMcp.upstreamSource}/skills/managing-google-workspace/. \
      "$out/skills/gmail/references/upstream/"
    cp ${workspaceMcp.upstreamSource}/LICENSE "$out/skills/gmail/references/upstream/LICENSE"
  '';
in mkToolset {
  name = "pi-toolset-gmail";
  inherit source;
  resources = {
    extensions = [ "85-gmail.ts" ];
    skills = [ "gmail" ];
  };
  runtimePackages = [ launcher ];
  requirements = [
    "Workspace MCP v2.1.0 and its uv.lock are pinned through flake.lock; dependencies built with uv2nix, no runtime uvx/npm install."
    "Enable Gmail API and create a Google OAuth client; store its JSON outside Git/Nix store at ~/.config/workspace-mcp/client_secret.json (or GOOGLE_CLIENT_SECRET_PATH)."
    "Authenticate with the start_google_auth MCP tool and a browser; this stdio server does not use /mcp login. One Google account per dedicated state directory."
    "gmail:send is cumulative upstream: readonly, labels, modify, compose and send scopes. Modification tools are disabled/hidden, but the token itself is not read/send-only."
    "Sending through mcp__gmail__send_gmail_message requires a human UI confirmation on every call; headless sends are blocked. This is a Pi tool gate, not OS-level isolation."
  ];
}
