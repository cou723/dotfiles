# Nix-managed Pi toolsets

This is a local Home Manager abstraction, not a standard Pi dependency format.
The Pi environment declares sets; each set owns its pinned assets, exported Pi
resources, runtime dependencies, dependencies on other sets, checks and remaining
runtime conditions. No APM/Renkei or Claude compatibility layer is needed for the
currently installed assets.

## Select sets

In `home-common.nix`:

```nix
programs.pi = {
  enable = true;
  package = piPackage;
  toolsets = with toolsets; [
    permissions history askUserQuestion context7 yomiyasu explainer nixToolsets todoist
  ];
};
```

The module computes the transitive closure of `piToolset.dependencies`, deduplicates
identical packages and rejects colliding resource destinations or distinct sets
with the same name. This is Nix dependency selection, not semver resolution.
Cycles in Nix derivation construction are not supported.

## Define sets

`default.nix` defines the sets using `mk-toolset.nix`. Example:

```nix
yomiyasu = mkToolset {
  name = "pi-toolset-yomiyasu";
  source = import ../pi-skills/yomiyasu.nix { inherit pkgs; };
  resources.skills = [ "yomiyasu" ];
  runtimePackages = [ pkgs.python3 ];
};
```

A consumer can declare `dependencies = [ toolsets.yomiyasu ];` to require that set,
rather than relying on the user to select both. Use an acyclic Nix definition.

The builder generates:
- `package.json`: native Pi resource manifest, from the resource declarations.
- `toolset.json`: local inventory of dependencies and runtime conditions.
- resource roots: symlinks to intact upstream assets, preserving relative references.

Toolsets are ordinary local Pi packages as well as Nix derivations. Home Manager
uses the same resource declarations to link assets into Pi's auto-discovery
directories. Do **not** also register those packages in Pi settings or `-e` in
that environment: that would load resources twice.

The Home Manager module:
- links selected extensions, skills, prompts and themes;
- supplies runtime packages and a `pi` launcher that prepends their binary paths;
- writes `~/.pi/agent/toolsets.json` with the resolved inventory;
- does not modify settings.json, auth.json, trust decisions, extension state or logs.

An inventory is not a runtime compatibility verifier. `requirements` records
conditions that are not automatically supplied. Check them for the workflow used.

## Existing boundaries

- **yomiyasu**: pinned source and Python runtime.
- **explainer**: five related skills kept at the same upstream revision; Node 24,
  Python and D2. Project JS packages, browsers, TALA, formal-methods tools and
  fresh-subagent backend remain outside this set's supplied environment.
- **todoist**: local Skill depends on **todoist-mcp**, a native Pi registration of the official OAuth HTTP service. No adapter or config-file merge. Remote implementation is not pinned; see [Todoist](todoist/README.md).
- **context7**: pinned native Pi extension, skill and prompt; no MCP process.
  Network/authentication remain runtime conditions.
- **permissions/history/question**: existing pinned extension packages, unchanged.
- **nix-management**: locally maintained `pi-nix-toolsets` skill with the intake,
  pinning, scope, dependency and validation procedure.

D2 currently resolves to v0.7.1 on the Linux lock. This does not satisfy the
TALA/terminal-renderer workflows by itself. Merely installing the Skill is not
proof that its full workflow works.

## Test and apply

```sh
cd ~/.config/home-manager
nix build .#checks.x86_64-linux.pi-toolsets \
  .#checks.x86_64-linux.pi-toolset-module \
  .#checks.x86_64-linux.pi-skills --no-link -L
nix build .#homeConfigurations.coura.activationPackage --no-link -L
# Actual activation, when desired:
home-manager switch --flake .#coura
```

After activation, restart Pi from the updated profile so it inherits the runtime
PATH. `/reload` discovers the new Skill but cannot replace the current process's
inherited environment. Use `/skill:pi-nix-toolsets` for future intake work.

Linux checks validate Todoist MCP registration without network access, resource manifests, nine Skills, sibling references,
yomiyasu execution, the runtime launcher, dependency inclusion, deselection and
collision detection. Existing extension checks remain in flake.nix.
Darwin can be evaluated here, but its binaries are not built on Linux.

## Project-specific sets and MCP/Hooks/Agents

This first abstraction exports Pi resources and their executable environments.
It does not implement a universal MCP/Hooks/Agents manifest or merge MCP config.
For a project-only set, supply it and its runtime closure through the project's
flake, not home-common.nix. The management Skill's reference shows a `project-pi`
launcher with `-e` for a local package.

MCP must use Pi's native config/registration with an explicit pinned executable.
Hooks/Agents need a chosen Pi execution backend. Their mere presence as files
does not make them executable. New integrations must include checks and avoid
silently replacing existing mutable settings. Secrets never belong in the store.

Source pins remain in pi-skills/sources.nix and the existing extension package.nix
files; flake.lock pins Pi/nixpkgs/Home Manager. Keep the configuration together.
The compatibility `pi-skills` output remains available, but consumers should
choose yomiyasu/explainer independently.
