# Nix-managed Pi packages

This is a local Home Manager convention, not an official Pi/Home Manager API.
Nix builds complete packages; Home Manager only publishes their declared resources
and runtime environment. It does not resolve or traverse a toolset dependency graph.

## Select packages

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

`toolsets` retains its existing name, but its entries are complete Pi packages.
The module deduplicates identical selections and rejects colliding resource
paths or package names. Do not select a component separately when a complete
package already publishes it. Shared components can be composed into one package.

## Build a complete package

`default.nix` uses `mk-toolset.nix`:

```nix
example = mkToolset {
  name = "pi-example";
  source = pinnedSource;
  resources.skills = [ "example" ];
  runtimePackages = [ pkgs.python3 ];
  components = [ anotherPiPackage ];
};
```

`components` is composition at Nix evaluation/build time, not another dependency
resolver. nixpkgs `buildEnv` merges the resource trees. A complete package's
manifest, resource declarations, runtime packages and remaining requirements
include its components. Components can themselves be composed packages; ordinary
Nix references provide build dependencies and retain referenced outputs.
Cycles in Nix package construction are not supported.

The builder emits a native Pi `package.json` and an informational `toolset.json`.
It preserves whole resource trees (including sibling/support files), excludes
component manifests from the merge, rejects conflicting files, and checks that
exported paths exist. Source revisions/hashes remain in the existing package
files and `pi-skills/sources.nix`; the lock file is unchanged.

The Home Manager module only:
- links the completed packages' extensions, skills, prompts and themes;
- supplies their runtime packages and a PATH-prepending `pi` launcher;
- writes `~/.pi/agent/toolsets.json` for the selected complete packages;
- leaves settings, credentials, OAuth state, trust decisions and logs untouched.

Pi does not read `toolset.json` as a dependency specification. Do not also load
these packages via Pi settings or `-e` in this global environment: that duplicates
resource registration. In a project, `-e` can load a complete package directly;
see the management Skill's [reference](management-skill/skills/pi-nix-toolsets/references/toolsets.md).

## Verification proportional to custom code

```sh
cd ~/.config/home-manager
nix build .#checks.x86_64-linux.pi-toolsets \
  .#checks.x86_64-linux.pi-toolset-module --no-link -L
nix build .#homeConfigurations.coura.activationPackage --no-link -L
# Activation is a separate, explicit operation:
home-manager switch --flake .#coura
```

- `pi-toolsets` builds the catalogue using `linkFarm`. Adding a definition needs
  no test-list update. It is a build gate, not an end-to-end runtime test.
- `pi-toolset-module` uses a small synthetic fixture for our custom publication,
  runtime launcher, deselection, collision and mutable-file boundaries. It does
  not enumerate installed Skills or compare hard-coded package counts.
- Existing focused checks for custom extensions and the compatibility `pi-skills`
  package remain unchanged. A new simple asset package does not require a test
  script; add one only for meaningful custom conversion/execution behaviour.

Build success is not proof of authentication, network availability, MCP tool
compatibility or an entire Skill workflow. First-use checks belong outside the
Nix build: confirm registration, authenticate interactively, then perform a small
read-only call with the user's permission. Do not create real-account test data.
After activation, restart Pi through the updated launcher to inherit PATH;
`/reload` alone cannot replace the process's inherited environment.

## Current boundaries

- **todoist** is one complete package containing the Skill and native MCP
  registration. The HTTP endpoint does not pin the remote implementation;
  see [Todoist](todoist/README.md).
- **yomiyasu** supplies its pinned Skill and Python.
- **explainer** supplies five pinned Skills, Node 24, Python and D2. Project JS
  dependencies, browsers, TALA, formal-methods tools and fresh subagents are not
  fully provisioned. Linux's locked D2 v0.7.1 does not supply the newer terminal
  renderer/TALA workflow.
- **context7** uses a pinned native extension, not an MCP adapter; network/auth
  remain runtime conditions.
- **permissions/history/question** keep their existing pinned extension packages.

`requirements` records remaining conditions; it does not verify or satisfy them.
MCP/Hooks/Agents still need a concrete Pi execution mechanism. Secrets never
belong in Nix outputs or Git. The combined `pi-skills` compatibility output remains.
