# Todoist for the Nix-managed Pi environment

The selected `todoist` package contains both the local Skill and the MCP
registration extension, composed with `components = [ todoistMcp ];` at Nix build
time. Home Manager publishes that complete package; it does not traverse a
separate dependency graph. No mutable npm install or MCP adapter is needed.

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

## Build and first-use checks

`checks.x86_64-linux.pi-toolsets` builds all catalogue packages, including this
complete package, and checks declared resource existence during construction.
The common module check uses synthetic fixtures, not a Todoist-specific test.

A successful build does not establish an authenticated connection. In Pi:
1. Use `/mcp` to confirm the server is registered and inspect its status.
2. If needed, use `/mcp login todoist` and approve in the browser.
3. Request a small read-only project/task list to confirm authenticated access.

Registration, authentication and a successful read are different states. A
failed remote call is not automatically a Nix configuration error. Remote schemas
can change independently of the local pins. Writes require a separate explicit
request and are not part of installation diagnostics.
