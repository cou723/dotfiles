# Context7 for Pi (global)

Uses the official `@upstash/context7-pi` extension, pinned to 0.1.2 with a
SHA-256 tarball hash. It has no runtime dependencies besides host-provided
Pi/typebox. No npm installation, npx downloads, or lifecycle scripts run.

Home Manager installs the same resources globally on Linux and macOS:

- `~/.pi/agent/extensions/70-context7.ts`
- `~/.pi/agent/skills/context7-docs/SKILL.md`
- `~/.pi/agent/prompts/c7-docs.md` (`/c7-docs` prompt template)

Pi discovers the two direct tools `resolve-library-id` and `query-docs`.
No MCP server or `mcp.json` entry is needed. The skill guides library-documentation
lookups. Run `/reload` or restart Pi after installation.

## Credentials and privacy

Works without credentials, subject to Context7's IP-based rate limits. For higher
quotas, export a personal `CONTEXT7_API_KEY` before starting Pi. Keep the key in
local secret management, never in Nix, tracked configs, or tool arguments.

Both tools send their query to `https://context7.com/api` and return documentation.
Do not pass secrets, personal data, or proprietary source code in a query.
The backend content and availability are remote and cannot be pinned by Nix;
only the installed extension and configuration are reproducible.

## Permission policy

chezmoi deploys the sibling `pi-permission-auto-review/permission-system.json`.
It explicitly allows these three names without AI review:

- `ask_user_question`
- `resolve-library-id`
- `query-docs`

Other tools, Bash, and MCP retain `ask` and the model-backed reviewer. These
exemptions are name-based: review any other extension that registers the same
names. Calls through codemode can still require review of the outer codemode
script; this does not exempt codemode itself.

## Tests

From the Home Manager flake directory:

```sh
nix build .#checks.x86_64-linux.pi-context7 --no-link -L
nix build .#checks.x86_64-linux.pi-permission-auto-review --no-link -L
```

The Context7 check uses the real Pi loader and mocked API responses to test
search, document queries, optional authentication, and rate-limit messages. It
also uses the actual permission-system resolver to confirm the exact exemptions
and that unrelated tools still resolve to `ask`. No network or LLM calls occur
in the Nix checks.
