{ pkgs, piPackage }:
let
  toolsets = import ./default.nix { inherit pkgs piPackage; };
  all = builtins.attrValues toolsets;
  runtimes = pkgs.lib.unique (pkgs.lib.concatMap (t: t.piToolset.runtimePackages) all);
in pkgs.runCommand "pi-toolsets-tests" {
  nativeBuildInputs = runtimes;
} ''
  export HOME="$TMPDIR/home"
  export PYTHONDONTWRITEBYTECODE=1
  mkdir -p "$HOME"
  export PI_PACKAGE_DIR=${piPackage}/lib/pi
  node ${./smoke-test.mjs} ${pkgs.lib.escapeShellArgs (map toString all)}
  TODOIST_MCP_ROOT=${toolsets.todoistMcp} node ${./todoist/check.mjs}
  python3 ${toolsets.yomiyasu}/skills/yomiyasu/scripts/yomiyasu_lint.py --help >/dev/null
  node --version | grep '^v24\.'
  d2 --version
  touch "$out"
''
