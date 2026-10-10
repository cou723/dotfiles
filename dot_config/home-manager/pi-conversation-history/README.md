# Pi conversation-only undo / branch navigation (Nix-managed)

## Installed upstream packages

- `pi-undo` **0.1.0** (Richard Anaya): `/undo [N]`.
  Source is the pinned npm tarball; this release has no repository URL in its manifest.
- [`pi-undo-tree`](https://github.com/ergenekonyigit/pi-undo-tree) **1.0.1**:
  `/undo-tree`, visual backward/forward navigation and branch selection.

Both packages are unmodified. Nix pins the npm URLs, versions and SHA-256 hashes
in `npm-sources.json`. They have no non-host runtime dependencies; peer packages
resolve to the same Nix-managed Pi runtime. No npm install, lifecycle scripts,
custom runtime adapter or upstream patch is used.

Pi was upgraded from 1.0.4 to **1.1.0** by updating only the `pi` input in
`../flake.lock` (stable commit `abe508e1b89912adde45528136c3221eb69acdd7`).
The other flake inputs were not updated.

## Usage

```text
/undo       # rewind one user turn
/undo 3     # rewind three user turns
/undo-tree  # interactive navigation, including returning to an abandoned branch
```

`N` counts **user submissions/turns**, not assistant messages or tool calls.
The selected original prompt is returned to the editor; edit and submit it to
start a replacement branch. While the agent is working, abort with Escape first.
When N exceeds the available history, undo stops at the beginning of the branch.

Inside `/undo-tree`:

- `↑` / `k`: move to the parent turn.
- `↓` / `j`: move forward to a child turn (visual redo).
- `←` / `h`, `→` / `l`: select alternative branches.
- `Enter`: switch to the selected turn **without a summary**.
- `e`: return to before the selected prompt and refill the editor for a retry.
- `q` / Escape: cancel the screen.
- `S` / Shift+Enter: switch with a model-generated summary. Avoid this when you
  want the later context excluded entirely; it can make an API call.

There is **no standalone `/redo` slash command** in this combination. Use
`/undo-tree`, select the original branch/turn, and press Enter. Native `/tree`
also remains available. Unlike a transient redo stack, abandoned branches remain
available even after a new prompt creates another branch.

Use the slash command rather than the advertised Ctrl+Shift+U shortcut: the
upstream shortcut has a non-command context fallback and is not covered by our
native AgentSession navigation test.

## Scope and safety

Only the active conversation branch / model context changes. Neither extension
captures workspace snapshots, restores/deletes files, runs Git, or undoes shell
or external effects. Original messages remain in the same session tree; this is
not deletion of the session JSONL. Existing files and changes remain as they are.

Consequently, retrying a prompt sees the **current disk state**, not the disk
state at the earlier conversation point. The permission-system and classifier
extensions have been removed; these navigation extensions do not gate tool calls.

`pi-undo` is a small 0.1.0 release with no upstream test suite declared. The
local build-time integration test checks its real behavior against the pinned
Pi runtime instead of assuming compatibility from its README.

## Deployment and tests

Home Manager deploys only one-line re-export entrypoints:

- `~/.pi/agent/extensions/30-conversation-undo.ts`
- `~/.pi/agent/extensions/40-conversation-undo-tree.ts`

```sh
nix build /home/coura/.config/home-manager#checks.x86_64-linux.pi-conversation-history --no-link -L
home-manager switch --flake /home/coura/.config/home-manager#coura
```

`smoke-test.mjs` is build-time-only. It uses the real Pi loader, SessionManager,
and AgentSession against isolated test paths, with synthetic history and no
model/API calls. It checks `/undo N`, rebuilt model context, retention of the
abandoned branch, real visualizer rendering and forward selection, default and
excessive N, invalid inputs, busy/cancel behavior and an unchanged workspace file.

For future Pi updates, update only that input, run the navigation check, then switch:

```sh
cd /home/coura/.config/home-manager
nix flake update pi
nix build .#checks.x86_64-linux.pi-conversation-history --no-link -L
home-manager switch --flake .#coura
```

Restart Pi after a version update; `/reload` reloads extensions but cannot replace
the running Pi executable/runtime.
