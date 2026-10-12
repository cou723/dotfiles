{ pkgs, piPackage }:
let
  source = pkgs.fetchurl {
    url = "https://registry.npmjs.org/@upstash/context7-pi/-/context7-pi-0.1.2.tgz";
    hash = "sha256-tDNzvGt9QMtohfcO/MfyoXaX0SEsbL/qQvOdVwH+y9c=";
  };
in pkgs.runCommand "pi-context7-0.1.2" {} ''
  mkdir -p "$out/node_modules/@upstash/context7-pi" "$out/node_modules/@earendil-works"
  tar -xzf ${source} --strip-components=1 -C "$out/node_modules/@upstash/context7-pi"
  ln -s ${piPackage}/lib/pi/node_modules/@earendil-works/pi-coding-agent "$out/node_modules/@earendil-works/pi-coding-agent"
  ln -s ${piPackage}/lib/pi/node_modules/typebox "$out/node_modules/typebox"
  # Official upstream source, without npm installation or lifecycle scripts.
  mkdir -p "$out/extensions"
  printf 'export { default } from "%s";\n' "$out/node_modules/@upstash/context7-pi/extensions/context7.ts" > "$out/extensions/70-context7.ts"
  ln -s "$out/node_modules/@upstash/context7-pi/skills" "$out/skills"
  ln -s "$out/node_modules/@upstash/context7-pi/prompts" "$out/prompts"
''
