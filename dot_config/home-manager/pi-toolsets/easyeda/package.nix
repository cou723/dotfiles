{ pkgs }:
let
  lib = pkgs.lib;
  python = pkgs.python3.withPackages (p: [ p.numpy p.scipy p.shapely ]);
  krt = pkgs.stdenv.mkDerivation {
    pname = "easyeda-krt";
    version = "0.22.0";
    src = pkgs.fetchurl {
      url = "https://github.com/drandyhaas/KiCadRoutingTools/releases/download/v0.22.0/KiCadRoutingTools-0.22.0.zip";
      sha256 = "75df60b82df577f5087be07ff07b3ef1b867c362ba57da8ad347c1f6a5f2f66e";
    };
    nativeBuildInputs = [ pkgs.unzip pkgs.autoPatchelfHook ];
    buildInputs = [ pkgs.stdenv.cc.cc.lib ];
    sourceRoot = "plugins";
    dontBuild = true;
    installPhase = ''
      mkdir -p $out/share/krt
      cp -r . $out/share/krt/
      rm $out/share/krt/rust_router/grid_router-*.{so,pyd}
      cp rust_router/grid_router-linux-x86_64.so $out/share/krt/rust_router/grid_router.so
    '';
    meta.license = lib.licenses.mit;
  };
  runtime = pkgs.buildNpmPackage {
    pname = "easyeda-copilot-runtime";
    version = "1.3.1";
    src = pkgs.fetchzip {
      url = "https://github.com/biosshot/easyeda-copilot/archive/5d24d1ef17a4a3854253b1fb9cdf907d05e3f9eb.tar.gz";
      sha256 = "0rajyv8d6hazih7gbhfmz4b95wbhv7n871zrfwz5mg85hb4xqkrn";
    };
    nodejs = pkgs.nodejs_24;
    npmDepsHash = "sha256-yr0GVsL67MRJxH+lG9wf04Lst3lFf5qUNcvlA52SjXA=";
    npmFlags = [ "--ignore-scripts" ];
    makeCacheWritable = true;
    nativeBuildInputs = [ pkgs.autoPatchelfHook pkgs.makeWrapper ];
    buildInputs = [ pkgs.stdenv.cc.cc.lib ];
    # The build is offline. No upstream lifecycle installer is allowed to fetch assets.
    buildPhase = ''
      runHook preBuild
      export HOME=$TMPDIR/home
      mkdir -p "$HOME"
      # Fail closed: never download Python, KRT, or pip dependencies at runtime.
      substituteInPlace node_modules/eda-copilot-router/package-dist/chunk-HNLIRFTO.js \
        --replace-fail 'async function prepareKrtRuntime(options = {}) {' 'async function prepareKrtRuntime(options = {}) { options = { ...options, assets: { ...options.assets, allowDownload: false }, pythonPath: process.env.COPILOT_ROUTER_PYTHON, krtDirectory: process.env.COPILOT_ROUTER_KRT_DIR };'
      npm run build --workspace=easyeda-copilot-mcp
      # npm also installs musl optional packages on Linux; this package targets glibc only.
      rm -rf node_modules/@img/sharp-linuxmusl-* node_modules/@img/sharp-libvips-linuxmusl-*
      npm run pack:skill --workspace=easyeda-copilot-mcp -- --bundled
      runHook postBuild
    '';
    installPhase = ''
      runHook preInstall
      mkdir -p $out/skills
      cp -r skill $out/skills/easyeda-copilot
      # Sibling datasheet/SPICE scripts must use the same pinned Sharp, not npm at runtime.
      ln -s scripts/runtime/node_modules $out/skills/easyeda-copilot/node_modules
      runHook postInstall
    '';
    # patchelf corrupts the prebuilt libvips init section. Keep it untouched;
    # patch only the consumers and backend, with libvips as a search path.
    dontAutoPatchelf = true;
    dontShrinkRpath = true;
    dontStrip = true;
    postFixup = ''
      modules=$out/skills/easyeda-copilot/scripts/runtime/node_modules
      addAutoPatchelfSearchPath "$modules/@img/sharp-libvips-linux-x64/lib"
      autoPatchelf "$modules/@img/sharp-linux-x64" "$modules/eda-copilot-backend/native"
    '';
    meta = { license = lib.licenses.mit; platforms = [ "x86_64-linux" ]; };
  };
  cli = pkgs.writeShellScriptBin "easyeda-copilot-cli" ''
    export COPILOT_ROUTER_PYTHON=${python}/bin/python3
    export COPILOT_ROUTER_KRT_DIR=${krt}/share/krt
    export PYTHONNOUSERSITE=1
    export PYTHONDONTWRITEBYTECODE=1
    export SPICE_NGSPICE=${pkgs.ngspice}/bin/ngspice
    export PATH="${lib.makeBinPath [ pkgs.nodejs_24 pkgs.poppler-utils pkgs.ngspice ]}:$PATH"
    exec ${pkgs.nodejs_24}/bin/node ${runtime}/skills/easyeda-copilot/scripts/easyeda-copilot-cli.js "$@"
  '';
in {
  inherit runtime cli krt python;
}
