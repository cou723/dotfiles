# Personal extension configuration

Reusable extension code, upstream patches and tests live in the independent private checkout:

`~/ghq/github.com/cou723/pi-resource-capabilities`

Global `settings.json` loads that local package's explicit three-entrypoint manifest. No duplicate code is auto-discovered in this directory.

Only personal configuration stays here:

- `pi-permission-system/config.json`: ordinary policy and authorizer chain.
- `pi-permission-classifier/config.json`: global classifier settings.

Grant/runtime, MCP/LSP/Hermes settings remain in the agent profile. `npm/patches` points to the checkout's managed peer patches. On a new machine, obtain the reviewed checkout before starting pi or installing the patched host workspace; chezmoi alone does not recreate the code repository. There is no fallback to an unprotected or unpatched implementation.

For checks, run `pnpm install --frozen-lockfile` and `pnpm check` from the independent checkout. See its README for installation and safety boundaries. No credentials, sessions, node_modules or personal learned data belong in that repository.
