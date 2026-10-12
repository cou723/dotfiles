# Pi skills (Home Manager)

The current environment selects independent yomiyasu/explainer toolsets via
`programs.pi.toolsets`; see [the toolset documentation](../pi-toolsets/README.md).
Source pins now live in `sources.nix`. `package.nix` preserves the combined
`pi-skills` output for compatibility and its existing checks.

`sources.nix` fixes both GitHub commit IDs and unpacked SHA-256 hashes.
`flake.lock` fixes nixpkgs, Home Manager and Pi; keep it together with this directory,
`flake.nix` and the home modules when copying/backing up the configuration.
No `pi install`, `npx ...@latest`, mutable Git checkout, or startup download is used.

| Source | Commit | Installed skills |
| --- | --- | --- |
| nanaism/yomiyasu | `373356eb874af5184962c88e925ea7eb58450318` | yomiyasu |
| mizchi/explainer | `578defba7249fde5366689424ed6017f76b5598b` | explainer, explainer-book, first-reader, d2-diagram, d2-slides |

Full upstream skill directories (scripts, references, assets and licenses) are
preserved unchanged in the Nix store. Home Manager links each one under
`~/.pi/agent/skills/`. Existing Pi settings and authentication files are untouched.
Python 3, Node.js 24 and D2 are provided by the locked nixpkgs revision.
Both `coura` (Linux) and `yuki.ueyama` (macOS) use the common module.

## Apply / test

```sh
home-manager switch --flake ~/.config/home-manager#coura
nix build ~/.config/home-manager#checks.x86_64-linux.pi-skills --no-link -L
```

For macOS use `#yuki.ueyama` when switching. Darwin evaluation was checked;
Darwin builds were not run on the Linux host.

In Pi, run `/reload` or restart, then invoke `/skill:yomiyasu` or
`/skill:explainer`. The smoke test uses the pinned Pi skill loader and
Home Manager-style directory symlinks to confirm all six skills are discovered
without collisions, and runs the yomiyasu lint/diff scripts on a small fixture.
This is not an end-to-end test of all explainer tools.

## Optional explainer tool dependencies

Installing the skills is not the same as installing every document-rendering,
browser, model-checking or subagent integration. Basic instruction-based use
needs no npm install. An already-running shell/Pi process may still have another
Node version earlier in PATH. After switching, the toolset module's Pi launcher
prepends the declared runtime binary paths; restart Pi through that launcher.
Check `node --version` inside Pi's bash environment. The upstream explainer scripts intentionally resolve many
JS dependencies from the **document project**, not from the skill directory.
Do not run the unversioned `npm i -D ...` example if dependency reproducibility
is important.

The package retains upstream `package.json` and `package-lock.json` under
`upstream/`. For a NEW dedicated document project, these provide a pinned
starting point:

```sh
skills=$(nix build ~/.config/home-manager#pi-skills --no-link --print-out-paths)
# Run in a new project; do NOT overwrite an existing project's manifests.
cp "$skills/upstream/package.json" "$skills/upstream/package-lock.json" .
chmod u+w package.json package-lock.json
PATH="$HOME/.nix-profile/bin:$PATH" PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --ignore-scripts
```

Commit the project manifests and use `npm ci`, not `npm install`, afterwards.
This optional npm setup still requires registry access; it is NOT a sandboxed
Nix dependency build. Skipping lifecycle scripts can require additional explicit
setup for optional tools. Playwright browsers must match the locked Playwright
version and need a separate Nix/browser configuration. No browser compatibility
or HTML/figure rendering has been tested here.

TALA, TLC/Apalache, and fresh-subagent support used by first-reader are also
optional and have not been installed/configured. Nix D2 alone does not include
TALA. On Pi, do not claim first-reader's fresh-subagent checks were run unless a
suitable subagent integration is available.

## Update intentionally

Review upstream changes, replace the commit IDs in `sources.nix`, obtain the new
hashes using `nix store prefetch-file --json --unpack <archive-url>`, run the
check above, and switch Home Manager. A normal switch never advances the skill
revisions. Update `flake.lock` separately only when changing the runtime/toolchain.
