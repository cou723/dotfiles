{ pkgs, piPackage }:
let
  # Registry integrity was independently verified during the 24-candidate survey.
  upstream = pkgs.fetchurl {
    url = "https://registry.npmjs.org/@agwab/pi-subagent/-/pi-subagent-0.6.4.tgz";
    hash = "sha256-Jl4idQsVOxnJbkMuurqoOGr2D24tHrTMBx+zt8jvqSU=";
  };
  config = pkgs.writeText "pi-defined-subagents-config.json" (builtins.toJSON {
    bwrap = "${pkgs.bubblewrap}/bin/bwrap";
    pi = "${piPackage}/bin/pi";
  });
in pkgs.runCommand "pi-defined-subagents-0.1.0-agwab-0.6.4" {} ''
  mkdir -p "$out/node_modules/@agwab/pi-subagent" "$out/node_modules/@earendil-works" "$out/extensions"
  tar -xzf ${upstream} --strip-components=1 -C "$out/node_modules/@agwab/pi-subagent"
  # Narrow, pinned internal runner adapter. Never register upstream's generic extension/API.
  # Replace its sandbox boundary with explicit Nix bubblewrap policy (Linux only).
  cp ${./sandbox.ts} "$out/node_modules/@agwab/pi-subagent/src/sandbox/srt.ts"
  cp ${config} "$out/node_modules/@agwab/pi-subagent/src/sandbox/runtime-config.json"
  cp ${./extension.ts} "$out/extensions/defined-subagents.ts"
  # Pi's loader evaluates a Home Manager symlink at the target path. An absolute
  # forwarding module keeps implementation-relative imports inside the Nix output.
  printf 'export { default } from "%s";\n' "$out/extensions/defined-subagents.ts" > "$out/extensions/60-defined-subagents.ts"
  cp ${./policy.ts} "$out/extensions/policy.ts"
  cp ${config} "$out/extensions/runtime-config.json"
  for name in pi-ai pi-coding-agent pi-tui; do
    ln -s ${piPackage}/lib/pi/node_modules/@earendil-works/$name "$out/node_modules/@earendil-works/$name"
  done
  # Use the host's flake-locked dependencies, avoiding a second Pi/SDK/TypeBox tree.
  for name in typebox proper-lockfile yaml; do
    ln -s ${piPackage}/lib/pi/node_modules/$name "$out/node_modules/$name"
  done
''
