{ pkgs, piPackage }:
let
  sources = builtins.fromJSON (builtins.readFile ./npm-sources.json);
  unpack = source: let
    tarball = pkgs.fetchurl { inherit (source) url hash; };
  in ''
    mkdir -p "$out/node_modules/${source.name}"
    tar -xzf ${tarball} --strip-components=1 -C "$out/node_modules/${source.name}"
  '';
in pkgs.runCommand "pi-ask-user-question-2.12.0" {} (''
  mkdir -p "$out/node_modules/@earendil-works"
'' + pkgs.lib.concatMapStrings unpack sources + ''
  for name in pi-ai pi-coding-agent pi-tui; do
    ln -s ${piPackage}/lib/pi/node_modules/@earendil-works/$name "$out/node_modules/@earendil-works/$name"
  done
  ln -s ${piPackage}/lib/pi/node_modules/typebox "$out/node_modules/typebox"
  # Unmodified upstream and pinned runtime dependency; no npm/lifecycle scripts.
  mkdir -p "$out/extensions"
  printf 'export { default } from "%s";\n' "$out/node_modules/@juicesharp/rpiv-ask-user-question/index.ts" > "$out/extensions/50-ask-user-question.ts"
'')
