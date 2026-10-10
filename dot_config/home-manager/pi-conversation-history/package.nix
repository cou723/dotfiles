{ pkgs, piPackage }:
let
  sources = builtins.fromJSON (builtins.readFile ./npm-sources.json);
  unpack = source: let
    tarball = pkgs.fetchurl { inherit (source) url hash; };
  in ''
    mkdir -p "$out/node_modules/${source.name}"
    tar -xzf ${tarball} --strip-components=1 -C "$out/node_modules/${source.name}"
  '';
in pkgs.runCommand "pi-conversation-history-undo-0.1.0-tree-1.0.1" {} (''
  mkdir -p "$out/node_modules/@earendil-works"
'' + pkgs.lib.concatMapStrings unpack sources + ''
  for name in pi-ai pi-coding-agent pi-tui; do
    ln -s ${piPackage}/lib/pi/node_modules/@earendil-works/$name "$out/node_modules/@earendil-works/$name"
  done
  # Unmodified upstream, no npm install or lifecycle scripts.
  mkdir -p "$out/extensions"
  printf 'export { default } from "%s";\n' "$out/node_modules/pi-undo/index.ts" > "$out/extensions/30-conversation-undo.ts"
  printf 'export { default } from "%s";\n' "$out/node_modules/pi-undo-tree/index.ts" > "$out/extensions/40-conversation-undo-tree.ts"
'')
