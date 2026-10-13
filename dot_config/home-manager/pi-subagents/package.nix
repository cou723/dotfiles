{ pkgs, piPackage }:
let
  sources = builtins.fromJSON (builtins.readFile ./npm-sources.json);
  permission = import ../pi-permission-auto-review/package.nix { inherit pkgs piPackage; };
  unpack = source: let tarball = pkgs.fetchurl { inherit (source) url hash; }; in ''
    mkdir -p "$out/node_modules/${source.name}"
    tar -xzf ${tarball} --strip-components=1 -C "$out/node_modules/${source.name}"
  '';
in pkgs.runCommand "pi-subagents-0.77.0" {} (''
  mkdir -p "$out/extensions/subagent" "$out/node_modules/@earendil-works"
'' + pkgs.lib.concatMapStrings unpack sources + ''
  for name in pi-ai pi-agent-core pi-coding-agent pi-tui; do
    ln -s ${piPackage}/lib/pi/node_modules/@earendil-works/$name "$out/node_modules/@earendil-works/$name"
  done
  ln -s ${piPackage}/lib/pi/node_modules/typebox "$out/node_modules/typebox"
  cp ${./compat.mjs} "$out/extensions/subagent/compat.mjs"
  cp ${./blocked.mjs} "$out/extensions/subagent/blocked.mjs"
  cp ${./index.ts} "$out/extensions/subagent/index.ts"
  cp ${./config.json} "$out/extensions/subagent/config.json"
  substituteInPlace "$out/extensions/subagent/index.ts" \
    --replace-fail '@PERMISSION@' '${permission}/extensions/10-permission-system.ts' \
    --replace-fail '@AUTO_REVIEW@' '${permission}/extensions/15-permission-auto-review.ts'
  # Pi/jiti resolves from the Home Manager symlink path, not the store root.
  ln -s "$out/node_modules" "$out/extensions/subagent/node_modules"
  ln -s "$out/node_modules/pi-subagents/agents" "$out/extensions/subagent/agents"
  ln -s "$out/node_modules/pi-subagents/docs" "$out/extensions/subagent/docs"
  cp ${./README.md} "$out/README.md"
'')
