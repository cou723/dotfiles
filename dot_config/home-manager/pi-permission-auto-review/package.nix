{ pkgs, piPackage }:
let
  sources = builtins.fromJSON (builtins.readFile ./npm-sources.json);
  unpack = source: let
    tarball = pkgs.fetchurl { inherit (source) url hash; };
  in ''
    mkdir -p "$out/node_modules/${source.name}"
    tar -xzf ${tarball} --strip-components=1 -C "$out/node_modules/${source.name}"
  '';
in pkgs.runCommand "pi-permission-auto-review-0.8.0" {} (''
  mkdir -p "$out/node_modules/@earendil-works"
'' + pkgs.lib.concatMapStrings unpack sources + ''
  for name in pi-ai pi-coding-agent pi-tui; do
    ln -s ${piPackage}/lib/pi/node_modules/@earendil-works/$name "$out/node_modules/@earendil-works/$name"
  done
  ln -s ${piPackage}/lib/pi/node_modules/typebox "$out/node_modules/typebox"
  # Bash parsing uses the published WASM, not tree-sitter-bash's native binding.
  # No npm install or lifecycle scripts run.
  mkdir -p "$out/extensions"
  printf 'export { default } from "%s";\n' "$out/node_modules/@gotgenes/pi-permission-system/src/index.ts" > "$out/extensions/10-permission-system.ts"
  printf 'export { default } from "%s";\n' "$out/node_modules/@mzwing/pi-permission-auto-review/dist/index.js" > "$out/extensions/15-permission-auto-review.ts"
'')
