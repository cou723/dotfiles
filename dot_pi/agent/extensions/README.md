# pi-resource-capabilities (private package, 0.1.0)

Portable code for a Resource capability Gate, Linux bash/LSP subprocess sandboxes, a bash-only classifier wrapper, and read-only LSP tools. The package manifest lists the three extension entrypoints; its `files` allowlist excludes personal policies and grants. Code is still stored in chezmoi, not yet moved to another repository or published.

## Prerequisites / configuration

Host pi 1.0.0 was tested. Install the pinned upstream peers using pi's package manager: @gotgenes/pi-permission-system 40.0.0, pi-permission-classifier 0.5.2, pi-lsp 0.1.7. Disable the latter two entrypoints (`extensions: []`) because their implementations are reused by wrappers. Pi provides its own SDK/API aliases; do not install a second SDK copy merely to satisfy peer warnings.

Global user-owned files live in the active agent directory (`getAgentDir()` in extensions, `PI_CODING_AGENT_DIR` for the CLI). They are not packaged:

- `resource-capability-gate.json`: version 1, server/domain mapping, githubGrants, slackGrants. Missing/invalid means tool calls fail closed.
- `resource-capability-runtime.json`: version 1, `protectedRoots` (absolute or ~/ paths), `lspServers` (name -> `{command: argv[]}`). `{node}` expands to the launcher's Node executable. Missing/invalid means fail closed. No project override is read.
- `extensions/pi-permission-system/config.json`: ordinary policy / authorizer chain.
- `extensions/pi-permission-classifier/config.json`: global classifier config.
- `lsp.json`: upstream LSP matching/initialization configuration.

Example runtime, with a deliberately arbitrary toolchain layout:

```json
{
  "version": 1,
  "protectedRoots": ["/path/to/extension-source", "/path/to/language-assets"],
  "lspServers": {
    "typescript": {"command": ["{node}", "/path/to/language-assets/node_modules/typescript-language-server/lib/cli.mjs", "--stdio"]}
  }
}
```

In `lsp.json`, launch with a direct argv array:

```json
{"bin":"node","args":["/installed/package/resource-capability-gate/lsp-server.mjs","/active/agent-directory","typescript"]}
```

No chezmoi or language-server installation directory is hard-coded in implementation code. The pi npm dependency directory is still the standard `<agentDir>/npm` used by pi's package manager. The default shared artifact/scratch boundary remains `/tmp/pi`; changing it is a separate authorization design change, not an installation-path setting.

## Protection / limits

- Loaded package paths, including their realpaths, are automatically immutable even when absent from protectedRoots. Fixed agent configuration/code/trust paths and all configured roots are protected in file-tool checks and reapplied read-only after the sandbox's writable workspace bind.
- Agent config/grant symlink targets are also immutable. Auth/mcp-auth symlink targets outside agentDir are masked in subprocesses, not merely made read-only.
- Register checkout paths and extra mutable symlink entrypoint locations in protectedRoots before installing from them. This also protects configured source copies not currently loaded. Preferred symlink installation is under `<agentDir>/extensions` or `<agentDir>/npm`, whose alias directories are protected already. Arbitrary same-user hostile changes/TOCTOU are not claimed to be prevented.
- Unknown top-level path-bearing tools are treated as writers by the independent Gate; known file/LSP readers retain read intent. This is not isolation of arbitrary extension internals or tools with hidden/non-path arguments.
- Bash: workspace + session scratch writable; network/PID isolated; credential environment stripped and key credential paths masked. LSP: workspace read-only, private scratch/cache writable. No host fallback, Linux/bwrap only.
- Global runtime commands are trusted executable configuration. Upstream project LSP trust can select host commands bypassing the configured launcher; review complete args/env before approving. Read-only LSP results do not replace typecheck/lint/test.
- Backlog/unknown external writes retain exact-call human approval. AI classification never takes authority over that independent Gate.

## Reproducible checks

From this directory:

```sh
pnpm install --frozen-lockfile
pnpm check
```

The workspace policy disables auto-installing peers and does not permit lifecycle builds. Linux `bwrap`, an installed pi SDK, installed upstream packages, and configured LSP servers are needed for full integration. SDK discovery asks `pnpm list -g --json` for the actual package path (including pnpm 11 hashed globals). For a non-pnpm host, set `PI_TEST_SDK_ROOT` to its package directory. Set `PI_CODING_AGENT_DIR` to the deployment under test if not the default. `PI_TEST_TMP_ROOT` can select a private fixture directory; the default is session scratch under `/tmp/pi`.

- `pnpm test`: policy, runtime/global-only/malformed config, symlink protection, real bash/LSP sandbox tests; no LLM or service posting.
- `pnpm typecheck`: local TypeScript entrypoints checked against the installed host declarations, not a hard-coded SDK location.
- `pnpm test:integration`: deployed SDK tool Gate + real LSP smoke; then independent relocated/symlinked package with a custom agent profile, intentionally permissive ordinary policy, different language-assets layout, direct/custom/bash write denial, credential masking, mandatory Backlog confirmation, and missing runtime fail-closed tests.

Tests own and delete only their mkdtemp fixtures, stop SDK/LSP processes on shutdown, and do not require or call a model. They use local mock external-service backends.

## Extraction checklist

1. Copy only package.json, lock/workspace policy, this README, the three code directories and tests into a private repository; do not copy personal config directories.
2. Keep grants/runtime/policies/LSP config in the agent profile, managed by chezmoi. Add the new checkout/install aliases and language assets to protectedRoots where required.
3. Install the package from a pinned reviewed revision; remove duplicate old discovered entrypoints, then update LSP launcher paths and Hermes fallback `childExtensionPaths` to the new install.
4. Run full checks against the deployment and start ordinary pi with protections enabled. Do not confuse a `--no-extensions` maintenance session with production behavior.
5. Only after verification, remove obsolete installed code/config. No automatic migration removes old paths or disables safety extensions.
