{ pkgs, piPackage }:
let
  mkToolset = import ./mk-toolset.nix { inherit pkgs; };
  permission = import ../pi-permission-auto-review/package.nix { inherit pkgs piPackage; };
  history = import ../pi-conversation-history/package.nix { inherit pkgs piPackage; };
  context7 = import ../pi-context7/package.nix { inherit pkgs piPackage; };
  question = import ../pi-ask-user-question/package.nix { inherit pkgs piPackage; };
  todoistMcp = import ./todoist/mcp.nix { inherit pkgs; };
  d2 = import ./d2/package.nix { inherit pkgs; };
in {
  easyeda = import ./easyeda { inherit pkgs; };
  hasdataAmazon = import ./hasdata-amazon { inherit pkgs; };
  subagents = mkToolset {
    name = "pi-toolset-subagents";
    source = import ../pi-subagents/package.nix { inherit pkgs piPackage; };
    resources.extensions = [ "subagent" ];
    runtimePackages = [ pkgs.nodejs_24 pkgs.git ];
    requirements = [ "Pi model authentication at runtime; Claude CLI is not required. Native children require the existing permission extensions; external/remote runners are intentionally rejected." ];
  };
  todoist = mkToolset {
    name = "pi-toolset-todoist";
    source = ./todoist;
    resources.skills = [ "todoist" ];
    # Skill と MCP 登録拡張を一つの完成パッケージにまとめる。
    components = [ todoistMcp ];
  };
  lcsc = mkToolset {
    name = "pi-toolset-lcsc";
    source = import ./lcsc/package.nix { inherit pkgs; };
    resources.skills = [ "lcsc" ];
    runtimePackages = [ pkgs.python3 ];
    requirements = [
      "Network access to jlcsearch.tscircuit.com for discovery and wmsc.lcsc.com for LCSC retail details; no API key required. Public endpoints and live stock/prices are not pinned."
    ];
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
    runtimePackages = [ pkgs.nodejs_24 pkgs.python3 d2 ];
    requirements = [
      "Document rendering: project-local locked JS dependencies and a matching Playwright browser; not supplied by this toolset."
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
  gitWorkflow = mkToolset {
    name = "pi-toolset-git-workflow";
    source = ./git-workflow;
    resources = {
      skills = [ "git-workflow" ];
      agents = [ "git-committer.md" ];
    };
    runtimePackages = [ pkgs.git ];
    requirements = [ "pi-subagents native runtime and Pi model authentication; supplied globally by the selected subagents toolset, not bundled here." ];
  };
  chromeDevtools = import ./chrome-devtools { inherit pkgs; };
  nixToolsets = mkToolset {
    name = "pi-toolset-nix-management";
    source = ./management-skill;
    resources.skills = [ "pi-nix-toolsets" ];
  };
}
