{ pkgs }:
let
  # The published package bundles its runtime dependencies (including Puppeteer,
  # Lighthouse and the MCP SDK). No npm install or browser download at runtime.
  version = "1.11.0";
  # Standalone flake packages/checks do not inherit Home Manager's allowUnfree.
  # Permit only this browser in a package set from the same pinned nixpkgs.
  chrome = (import pkgs.path {
    inherit (pkgs.stdenv.hostPlatform) system;
    config.allowUnfreePredicate = pkg: pkgs.lib.getName pkg == "google-chrome";
  }).google-chrome;
  source = pkgs.fetchzip {
    url = "https://registry.npmjs.org/chrome-devtools-mcp/-/chrome-devtools-mcp-${version}.tgz";
    hash = "sha256-L67t60i3zUKlZmn6uh9SlJh2B2nC+iQIjvIlUD6ox1k=";
  };
in pkgs.writeShellScriptBin "pi-chrome-devtools-mcp" ''
  export CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1
  export CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1
  export CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY=1
  exec ${pkgs.nodejs_24}/bin/node ${source}/build/src/bin/chrome-devtools-mcp.js \
    --executable-path=${chrome}/bin/google-chrome-stable \
    --no-usage-statistics --no-performance-crux \
    --redact-network-headers --no-file-navigations "$@"
''
