{ pkgs, piPackage }:
let
  mkToolset = import ./mk-toolset.nix { inherit pkgs; };
  permission = import ../pi-permission-auto-review/package.nix { inherit pkgs piPackage; };
  history = import ../pi-conversation-history/package.nix { inherit pkgs piPackage; };
  context7 = import ../pi-context7/package.nix { inherit pkgs piPackage; };
  question = import ../pi-ask-user-question/package.nix { inherit pkgs piPackage; };
  todoistMcp = import ./todoist/mcp.nix { inherit pkgs; };
in {
  inherit todoistMcp;
  todoist = mkToolset {
    name = "pi-toolset-todoist";
    source = ./todoist;
    resources.skills = [ "todoist" ];
    # Skill と MCP 登録拡張を一つの完成パッケージにまとめる。
    components = [ todoistMcp ];
  };
  yomiyasu = mkToolset {
    name = "pi-toolset-yomiyasu";
    source = import ../pi-skills/yomiyasu.nix { inherit pkgs; };
    resources.skills = [ "yomiyasu" ];
    runtimePackages = [ pkgs.python3 ];
  };
  explainer = mkToolset {
    name = "pi-toolset-explainer";
    source = import ../pi-skills/explainer.nix { inherit pkgs; };
    resources.skills = [ "explainer" "explainer-book" "first-reader" "d2-diagram" "d2-slides" ];
    runtimePackages = [ pkgs.nodejs_24 pkgs.python3 pkgs.d2 ];
    requirements = [
      "Document rendering: project-local locked JS dependencies and a matching Playwright browser; not supplied by this toolset."
      "D2 workflows: TALA and the required terminal renderer must be verified; nixpkgs D2 alone is not a guarantee."
      "Fresh-reader workflows: a suitable fresh-subagent execution backend; not installed here."
      "Formal-methods workflows: TLC/Apalache/Z3 as needed; not installed here."
    ];
  };
  context7 = mkToolset {
    name = "pi-toolset-context7";
    source = context7;
    resources = {
      extensions = [ "70-context7.ts" ];
      skills = [ "context7-docs" ];
      prompts = [ "c7-docs.md" ];
    };
    requirements = [ "Context7 network access and CONTEXT7_API_KEY at runtime; never put the key in Nix/store files." ];
  };
  permissions = mkToolset {
    name = "pi-toolset-permissions";
    source = permission;
    resources.extensions = [ "10-permission-system.ts" "15-permission-auto-review.ts" ];
  };
  history = mkToolset {
    name = "pi-toolset-history";
    source = history;
    resources.extensions = [ "30-conversation-undo.ts" "40-conversation-undo-tree.ts" ];
  };
  askUserQuestion = mkToolset {
    name = "pi-toolset-ask-user-question";
    source = question;
    resources.extensions = [ "50-ask-user-question.ts" ];
  };
  nixToolsets = mkToolset {
    name = "pi-toolset-nix-management";
    source = ./management-skill;
    resources.skills = [ "pi-nix-toolsets" ];
  };
}
