{ pkgs }:
let eda = import ./package.nix { inherit pkgs; };
in pkgs.runCommand "easyeda-runtime-check" {
  nativeBuildInputs = [ pkgs.nodejs_24 eda.cli ];
} ''
  export HOME=$TMPDIR/home
  export EASYEDA_COPILOT_CLI_HOME=$TMPDIR/cli
  export COPILOT_ROUTER_CACHE_DIR=$TMPDIR/router-cache
  export COPILOT_ROUTER_PYTHON=${eda.python}/bin/python3
  export COPILOT_ROUTER_KRT_DIR=${eda.krt}/share/krt
  export PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1
  export EASYEDA_TEST_SKILL=${eda.skill}/skills/easyeda-copilot
  mkdir -p "$HOME"
  easyeda-copilot-cli --help
  node ${./smoke-test.mjs}
  test ! -e "$COPILOT_ROUTER_CACHE_DIR"
  # Isolate the test broker from the real EasyEDA extension and other tasks.
  export EASYEDA_COPILOT_MCP_WS_PORT=18787
  id=$(easyeda-copilot-cli start)
  trap 'easyeda-copilot-cli "$id" stop' EXIT
  easyeda-copilot-cli "$id" status > status.json
  easyeda-copilot-cli "$id" tools help make_pcb_layout > schema.json
  node -e 'const fs=require("fs"); for(const p of ["status.json","schema.json"]) JSON.parse(fs.readFileSync(p));'
  easyeda-copilot-cli "$id" stop
  trap - EXIT
  touch $out
''
