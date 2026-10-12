# Todoist for the Nix-managed Pi environment

The selected `todoist` toolset exports the local Todoist Skill and declares
`dependencies = [ todoistMcp ];`. Home Manager includes the registration extension
transitively. No manual `pi mcp add`, mutable npm install or MCP adapter is needed.

The extension registers `todoist` with Pi's built-in MCP client:
- HTTP endpoint: https://ai.todoist.net/mcp
- exposure: codemode
- authentication: Pi OAuth, browser approval; service advertises data:read_write

Official source/docs: https://github.com/Doist/todoist-mcp
Endpoint and OAuth metadata were checked at setup time. Those are live services;
their implementations and tool schemas are not Nix-pinned. Local registration,
Skill and Pi host are part of the Nix configuration. Secrets stay outside Nix.

## Authenticate after activation

In the running Pi session:

```text
/reload
/mcp login todoist
```

Use `/mcp` to inspect status. A new Pi session also loads the registration.
If the browser is on another machine, follow Pi's own callback-paste prompt.
Do not paste tokens or OAuth callback URLs into ordinary chat.

The shell-level `pi mcp list/login` does not load extensions and therefore does
not see this extension-registered server. Use Pi's interactive commands.

Try `/skill:todoist` or ask to show a small project/task list. Initial checks should
be read-only. Do not create a test task in the real account without asking.

## State and removal

Pi stores OAuth credentials in its mutable agent directory. The Home Manager
module does not manage or overwrite that file. Disabling/enabling a registered
server through /mcp applies only to the current session; Nix selection controls
persistent enablement. A same-name file-defined MCP entry overrides the extension.

To remove: deselect `todoist` and switch, then reload/restart Pi. The dependent
registration disappears too unless selected elsewhere. Revoke/sign out OAuth
separately if desired. Removal does not delete Todoist data.

## Tests

`checks.x86_64-linux.pi-toolsets` validates Skill loading and actual Pi loader
registration with network forbidden. The module check validates dependency
inclusion, deselection and that mcp.json is not overwritten.
These tests do not prove authenticated access to an account or write operations.
