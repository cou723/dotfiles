# Pi automatic permission review

Home Manager installs two ordered extension entry points on Linux and macOS:

- `10-permission-system.ts`: `@gotgenes/pi-permission-system` 39.0.0
- `15-permission-auto-review.ts`: `@mzwing/pi-permission-auto-review` 0.8.0

The npm tarballs and runtime dependencies are hash-pinned in `npm-sources.json`.
No npm lifecycle scripts run. The Bash parser uses the published WASM, so native
`tree-sitter-bash` build dependencies are not needed. Host Pi packages are linked
from the flake's Pi derivation, not duplicated.

## Configuration (chezmoi)

Canonical config lives beside this README. chezmoi templates include these files:

- `permission-system.json` → `~/.pi/agent/extensions/pi-permission-system/config.json`
- `auto-review.json` → `~/.pi/agent/extensions/pi-permission-auto-review/config.json`

Edit `additionalPolicy` in `auto-review.json` to change classification policy.
`includeBaselinePolicy: false` disables the bundled Guardian policy, but not the
upstream fixed output protocol. The reviewer uses the existing `openai` login and
`gpt-6.1-sol`; change `provider`/`model` to use another registered reviewer model.
Every reviewed action makes a separate paid model request, potentially retried
within the configured 30-second total timeout.

All tool surfaces default to `ask` and the `auto-review` authorizer resolves them.
`path` and `external_directory` are uniformly `allow`: they do not decide which
directories are safe, and do not bypass the later tool/Bash/MCP review. There are
no directory-specific allow/deny patterns. `yoloMode` is disabled.

Restart Pi or `/reload` after deploying the extension/config. The upstream
`/permission-auto-review show` command displays effective reviewer settings;
`/permission-auto-review` opens its editor. Local edits will be overwritten by
chezmoi: change the canonical source for durable configuration.

## Limits

- A reviewer denial blocks execution. Model/credential/timeout/parse failures
  defer to human confirmation; headless permission requests are denied.
- The upstream reviewer does not automatically inject tool descriptions or
  side-effect annotations. Effects are inferred from request evidence. Unknown
  effects must not be assumed safe under the configured policy.
- Complete direct-call arguments are recovered from the active transcript.
  Nested codemode calls are gated by Pi, but their complete arguments are not
  necessarily available to this reviewer. Permission payload/preview is used
  when transcript lookup fails. This is not proven full-argument coverage.
- Trusted project configs, session grants, and explicit interactive approvals can
  change effective routing. Do not grant session-wide approval if every call must
  receive a model review. This configuration is not an OS sandbox.
- Review logs are local under the permission-system config directory and excluded
  from chezmoi/Git; they may contain commands and arguments. Reviewer evidence is
  sent to the configured provider.

## Test

```sh
nix build .#checks.x86_64-linux.pi-permission-auto-review --no-link -L
```

Run from the Home Manager flake directory. This checks the real Pi loader,
registered hooks, config routing, custom policy, complete direct-call argument
serialization, verdict parsing, and both WASM files without credentials/API calls.
It does not measure live model judgement quality or prove every nested call's
argument coverage.
