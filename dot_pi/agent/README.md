# pi environment: capabilities, memory, workflows

## Installed / managed

- pi 1.0.0 (existing host; not upgraded).
- @gotgenes/pi-permission-system **40.0.0**.
- pi-permission-classifier **0.5.2** (upstream extension entrypoint disabled; reviewer reused by local `bash-classifier`).
- pi-hermes-memory **0.9.10**.
- @gotgenes/pi-subagents **23.2.0**.
- pi-lsp **0.1.7** (upstream entrypoint disabled; loaded through `extensions/lsp-readonly`).
- Local extensions: `extensions/resource-capability-gate`, `extensions/bash-classifier`, `extensions/lsp-readonly`.
- Package installation uses pnpm (`settings.json: npmCommand`). Native SQLite build approval and dependency lockfile are managed under `npm/`; installed node_modules are NOT tracked.

Extension implementations and personal configuration currently live in chezmoi's `dot_pi/agent/`; portability is validated with relocated-code integration tests. Apply with `chezmoi apply ~/.pi/agent`, then `/reload` in pi (or start a new pi process). This configuration does not retroactively constrain a session that has not reloaded it.
After deploying onto another machine, `pi update --extensions` reconciles the pinned packages. Linux `bwrap` is required for bash. Sandbox failures do not fall back to host execution.

## Code / personal config separation

The reusable package boundary is `extensions/package.json`; it includes only `resource-capability-gate`, `bash-classifier`, `lsp-readonly`, managed upstream patches, tests and package documentation. Personal settings are excluded by its files allowlist. It is private and has not yet been moved/published.

- `resource-capability-gate.json`: global GitHub/Slack grants and server/domain mapping (moved OUT of the code directory).
- `resource-capability-runtime.json`: global protected source/toolchain roots and reviewed LSP command argv, rendered from chezmoi with the actual sourceDir/homeDir.
- Permission policy, classifier config, `lsp.json`, Hermes config and pi settings remain personal chezmoi files.
- Loaded code's lexical/real paths are automatically protected; configured source copies and dependency roots are protected too. Settings/grant and credential symlink targets outside the agent directory retain protection/masking.
- The global runtime/grant layer has no project override. Trusted project ordinary permission policy can still override global rules, but cannot remove the independent immutable-root checks or subprocess sandbox.

See `extensions/README.md` for package extraction/install-alias protection, dependency assumptions, maintenance and reproducible verification.

## Commands / daily use

- `/capabilities`: show grants, current session scratch, and tracked shared-file ownership.
- `/permission-model`: show reviewer config; `/permission-model provider/model` or `session` changes it for THIS session. Persistent config is edited in chezmoi.
- `/commit` or `/skill:commit-workflow`: commit in the SAME context; no implicit push/new session.
- `/memory-skills`, `/memory-insights`, `/memory-preview-context`: Hermes management / context inspection.
- `skill_manage`: save reusable procedures with explicit `scope: project` for project-specific work.
- `workflow-worker` subagent: separate/resumable work when explicitly requested; questions/approval limitations go through `ask_parent`.

## Filesystem policy

- Shared plans/reports: `/tmp/pi/<descriptive-name>.md` via read/write/edit.
- Executable fixtures/build outputs: `/tmp/pi/<session-id>/scratch/` (see `/capabilities`).
- New shared documents are writable. Existing shared files require one-time approval unless created/approved in this session. Ownership is recorded as non-context session entries, reconstructed from the current branch after reload/resume.
- Literal standalone `rm -rf -- <path>` is permitted only after target validation. Own scratch children can be cleaned; project children require human target confirmation. Workspace/root/home/scratch roots, shared `/tmp/pi` roots and other task outputs cannot be deleted.
- Variables/globs/chains/wrappers in rm and `find -delete` are rejected; use separate literal commands.
- `/tmp/pi` symlink escape, immutable policy/extension writes, npm/npx, gh, sudo/doas, git force-push/reset-hard/clean are restricted.
- bash runs under **Linux bubblewrap** with read-only host mounts, writable cwd + own scratch, isolated PID/network, credential environment removed, and key credential paths masked. `/tmp/pi` is read-only to bash outside own scratch; use file tools for shared documents. `!` commands use the same sandbox, but are manually issued commands, not agent permission requests.
- No writable toolchain cache outside cwd/scratch and no bash network are granted initially. Downloads need a separately reviewed mechanism; this is intentionally stricter than ordinary host shell execution.
- Protecting all secrets in all project subdirectories, whole-process isolation, and arbitrary third-party extension internals are NOT guaranteed by this tool-only sandbox. Never provide unnecessary secrets. Non-Linux bash fails closed pending a platform-specific backend.
- file:// and unusual Unicode-space path spellings are rejected by the extra Gate rather than silently resolved differently. Use ordinary paths.
- Symlink checks at the tool layer are not an atomic filesystem transaction; concurrent hostile same-user changes are outside its guarantee. The subprocess sandboxes provide separate OS boundaries for bash and configured LSP servers, not for pi itself.
- `/tmp` is disposable. Move reviewed durable artifacts and curated project Skills into a repository when appropriate.

## LSP

- Config: `~/.pi/agent/lsp.json`, rendered from chezmoi `dot_pi/agent/lsp.json.tmpl`.
- Enabled: TypeScript/JavaScript, Python (Pyright), JSON/JSONC, YAML, C/C++ (existing clangd).
- Tools: `lsp_diagnostics`, `lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_symbols`. Positions are **zero-based**, character offsets are UTF-16.
- Successful write/edit calls automatically receive diagnostics. Servers start lazily and are stopped at session shutdown. No rename/code-action tool that directly changes files is enabled.
- The upstream diagnostics tool is cache-only. The local wrapper opens/updates the document through the upstream symbols tool before checking diagnostics; it waits up to 15 seconds for the first publication and warns, rather than claiming success, if none arrives. Diagnostics remain asynchronous/advisory; always run project checks before completion.
- Configured server commands use `extensions/resource-capability-gate/lsp-server.mjs <agent-dir> <server-name>`; actual argv comes from `resource-capability-runtime.json`:  Linux/bwrap, no shell, no network, read-only sources/host, private writable `/tmp/pi/lsp-*` scratch/cache, stripped credential environment, key credential paths masked. Failure never falls back to host execution. Whole-process/extension isolation is still NOT claimed.
- Node-based servers are installed separately under `~/.local/share/pi-language-servers/`, avoiding the masked agent directory. Manifest, lockfile and build policy are managed in `dot_local/share/pi-language-servers/`; node_modules are ignored. TypeScript 5.9.3, typescript-language-server 6.0.1, Pyright 1.1.414, vscode-langservers-extracted 4.10.0, yaml-language-server 1.24.0 are pinned. core-js's nonessential install script is disabled.
- On another machine: `chezmoi apply ~/.local/share/pi-language-servers ~/.pi/agent`, then `pnpm --dir ~/.local/share/pi-language-servers install --frozen-lockfile --config.auto-install-peers=false`, and reconcile pi packages as above. Install clangd separately if needed.
- Rust: added rust-analyzer/rust-src to the existing active rustup toolchain (analyzer 1.95.0). Server initialization ran, but the readonly-sandbox trial did not receive Rust diagnostics within 15 seconds; **Rust is disabled initially** until further validation. Its config template disables build scripts/proc macros/check-on-save. Nix/Go/etc. servers are not installed by this change.
- Upstream project `.pi/lsp.json` requires hash-based human trust; noninteractive mode rejects unknown hashes. Trust can select arbitrary host commands and BYPASS the configured launcher, so inspect the entire config/args, not just binary names, before approving. The trust store is local, excluded from chezmoi and protected from agent file writes. Global lsp config/launcher/server packages are likewise protected.
- Managed pnpm patches under `extensions/patches/` fix pi-lsp empty/fresh diagnostics and active-profile config/trust lookup, and allow permission-system extractors to declare trusted read intent. `npm/pnpm-workspace.yaml` applies them via the `npm/patches` symlink. Reinstall the host npm workspace with its managed lockfile after deployment; missing patch contracts disable the LSP adapter rather than weakening policy.
- Protected source can be inspected by the five LSP readers, while native/custom writes, model-provided read-only claims, and secret-path reads stay denied. A protected source cwd is accepted only for the LSP read-only workspace, never writable bash.
- The wrapper depends on patched pi-lsp 0.1.7 and permission-system 40.0.0 internals; upgrade only after regenerating/reviewing patches and rerunning the full smoke tests.

## AI reviewer

`pi-permission-classifier` ignores its former `surfaces` setting. To avoid accidentally auto-approving MCP/custom tools, its upstream entrypoint is disabled in the settings package filter. Local `bash-classifier` reuses the pinned upstream reviewer and forcibly defers all non-bash surfaces before any model call.

- Only global `extensions/pi-permission-classifier/config.json` supplies its rubric/model. Project files do not loosen it.
- Default model is the session model. Set `provider`/`model` in the global JSON for a dedicated classifier.
- Unknown/opaque commands defer; errors/timeouts defer; no human UI means the permission system blocks unresolved asks.
- Reasoned deterministic denies run independently of the reviewer.
- The wrapper imports internal modules of version 0.5.2; upgrading that package requires rerunning integration tests.

## MCP / external posting

All three servers are **disabled initially** because credentials/app configuration are not available. No GitHub/Slack/Backlog comment was posted during setup.

1. Configure credentials OUTSIDE chezmoi source (environment / secret manager).
2. Edit chezmoi's `mcp.json`; apply it; enable ONLY the intended server.
3. Run `pi mcp list` and verify the Gate has loaded with `/capabilities` after reload.
4. Initially test reads, then a deliberately denied write, then an explicitly approved test write to a dedicated test resource.

### GitHub

- Official hosted MCP URL is preconfigured.
- Set `GITHUB_MCP_TOKEN` to a minimally scoped token. Metadata validation uses the SAME token as MCP.
- `githubGrants` in `resource-capability-gate.json` can permit `add_issue_comment` for explicit repo, kind (`issue`/`pr`), optional number, and relation (`any`/`assignee`/`reviewer`/`author`). Empty means all writes require a human.
- Issue vs PR and identity are read from GitHub API, not model-provided flags. Reviewer means a currently requested individual reviewer, not a team reviewer or historical review.
- No automatic grant covers review submission, merge, deletion, PR line comments, or unknown write tools; those require human approval.

Example (NOT enabled by default):

```json
{"repo":"OWNER/REPO","kind":"issue","relation":"assignee","number":123}
```

### Slack

- Official MCP URL/OAuth client template is preconfigured. Replace `SET_SLACK_APP_CLIENT_ID` with a registered app's client ID and set `SLACK_MCP_CLIENT_SECRET`. Check Slack admin approval and OAuth redirect URI before enabling.
- `slackGrants` supports explicit workspace/channel, optional thread, `mentionedOnly`.
- A separate `SLACK_CAPABILITY_TOKEN` must NOT be assumed to identify the same user as MCP OAuth. **Automatic grants are disabled unless the active MCP config's Authorization header is exactly `Bearer ${SLACK_CAPABILITY_TOKEN}` and endpoint is the official one.** Configure a supported same-token authentication path before using grants; OAuth mode remains human-approved if that identity binding cannot be established.
- Only known plain-text thread reply tool shapes are candidates. New channel posts, broadcast, scheduled messages, blocks/attachments, update/delete/upload and unknown tools require human approval.
- Mention evidence is checked via auth.test + conversations.replies, against API identity and workspace. Pagination/incomplete evidence/API failure returns to human approval.
- Tool names/input schemas must be verified against the connected server; unrecognized versions do not auto-grant.

Example (NOT enabled by default):

```json
{"workspace":"T123","channel":"C123","thread":"123.456","mentionedOnly":true}
```

### Backlog

- Official `backlog-mcp-server@0.20.5` launcher uses pnpm dlx, only project/issue/git toolsets.
- Set `BACKLOG_DOMAIN` and `BACKLOG_API_KEY`, and verify those toolsets/schema with the actual server.
- All mutations require a human once per exact call; no blanket session approval and no AI approval grants posting authority.

### Gate behavior / limits

- Explicit read-only tool allowlist. Unknown tool shapes default to human confirmation.
- Normalized write operation includes domain/action/resource/payload. The UI shows the complete exact call (over-budget payloads are refused); changed input after confirmation is refused.
- No UI in a child means no automatic uncertain write; have the child ask the parent.
- Independent audit entries store tool/resource/verdict and payload SHA-256, not posting bodies/tokens.
- permission-system's default MCP policy is ask; `resource-tool-gate` deterministically delegates to the independent `tool_call` Gate only when that extension is present. Missing authorizer falls back to human confirmation, and bash classifier cannot approve it.
- Network-disabled bash and credential masking reduce CLI/script bypass. Extensions run in the host process; review custom tools and keep credentials minimal. Manually disabling all extensions explicitly removes these gates.

## Hermes

- policy-only + compact memory guidance: no full memory reinjection every turn.
- Lazy memory initialization; anchor-based history search.
- Background review every 20 turns or 30 tool calls; latest 20 messages reviewed. Corrections include Japanese patterns.
- Automatic overflow consolidation/compact flush/shutdown flush/pinned-instruction injection are off initially to bound surprise subprocesses and cost. Explicit memory and project Skill management remain available.
- Default direct background completion can fall back to a child pi subprocess. `childExtensionPaths` explicitly includes permission-system, bash classifier, and Resource capability Gate so fallback children do not silently omit safety controls.
- Data lives in `~/.pi/agent/pi-hermes-memory/` and `projects-memory/`; credentials/history/learned memory are excluded from chezmoi. Curate portable Skills into project repositories.

## Verification

Reproducible code/tests: `extensions/tests/` and `extensions/resource-capability-gate/*.test.mjs`. Setup logs remain under `/tmp/pi/environment-build/`, but the tests no longer depend on temporary scripts.

- In `dot_pi/agent/extensions/`, run `pnpm install --frozen-lockfile` and `pnpm check` (36 unit/sandbox tests, host TypeScript checks, deployed SDK/LSP smoke and relocated/symlinked-package integration). SDK path is discovered from pnpm's actual global package metadata or explicit PI_TEST_SDK_ROOT, not hard-coded.
- SDK fixture loads all installed extensions, exercises nested write/read/denied operations and mock MCP reads/writes, with no LLM requests or real service mutations.
- LSP SDK smoke tested real TypeScript diagnostics/hover/definition/references/symbols, automatic write diagnostics, JSON/YAML/Python/C++ diagnostics, blocked config/secret access, and noninteractive project trust rejection. Logs: `lsp-smoke.log`; Rust's unsuccessful diagnostic trial is preserved in `lsp-rust-smoke.log`.
- Relocation smoke uses a different package location/agent profile/LSP asset layout and a permissive ordinary policy; verifies independent code/config write rejection, OS readonly protection, credential masking, required Backlog confirmation and missing runtime fail-closed behavior.
- Additional deterministic LSP/permission regressions cover clean/unchanged/error-cleared documents, old versions, delayed publications, genuine no-publication warnings, protected/external read direction, writer/secret rejection, and missing patch contracts. Real relocated LSP assertions include its unique server id so silently using another profile cannot pass.
- TypeScript checking uses the installed pi declarations.
- Actual OAuth, production tool schemas, real classifier latency/accuracy, background learning/fallback runs, and live subagent model turns still need user-visible integration trials. Current checks do not claim these were exercised.
