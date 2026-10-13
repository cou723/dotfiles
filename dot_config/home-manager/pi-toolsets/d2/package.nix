{ pkgs }:
let
  version = "0.9.0";
  # Official release archives, checked against GitHub's published SHA-256.
  # Source builds need Go 1.27; keep the shared nixpkgs lock unchanged.
  releases = {
    x86_64-linux = {
      platform = "linux-amd64";
      hash = "sha256-VmndxGuZ6ULMlgePSk421eYhAzSPTAUXnt4ngC/dh6k=";
    };
    aarch64-darwin = {
      platform = "macos-arm64";
      hash = "sha256-6vbAwUPlbdn6l7+23yXqnB685AJF8FagdozxpsFdMGQ=";
    };
  };
  release = releases.${pkgs.stdenv.hostPlatform.system}
    or (throw "Pi D2: unsupported platform ${pkgs.stdenv.hostPlatform.system}");
in pkgs.stdenvNoCC.mkDerivation {
  pname = "d2";
  inherit version;
  src = pkgs.fetchurl {
    url = "https://github.com/d2lang/d2/releases/download/v${version}/d2-v${version}-${release.platform}.tar.gz";
    inherit (release) hash;
  };
  dontBuild = true;
  # Preserve the official static Go executable rather than patching/stripping it.
  dontStrip = true;
  installPhase = ''
    runHook preInstall
    install -Dm755 bin/d2 "$out/bin/d2"
    install -Dm644 man/d2.1 "$out/share/man/man1/d2.1"
    install -Dm644 LICENSE.txt "$out/share/licenses/d2/LICENSE.txt"
    install -Dm644 THIRD_PARTY_NOTICES.txt "$out/share/licenses/d2/THIRD_PARTY_NOTICES.txt"
    runHook postInstall
  '';
  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME="$TMPDIR/home"
    mkdir -p "$HOME"
    test "$("$out/bin/d2" --version)" = "v${version}"
    "$out/bin/d2" layout | grep -F "tala (bundled)"
    printf 'api -> db\n' > smoke.d2
    "$out/bin/d2" validate smoke.d2
    "$out/bin/d2" --layout=tala smoke.d2 smoke.svg
    "$out/bin/d2" --layout=tala --ascii-mode=standard smoke.d2 smoke.txt
    "$out/bin/d2" --layout=tala smoke.d2 smoke.png
    test -s smoke.svg
    grep -F api smoke.txt
    grep -F db smoke.txt
    test -s smoke.png
    runHook postInstallCheck
  '';
  meta = {
    description = "Official D2 release with bundled TALA and native image/terminal rendering";
    homepage = "https://d2lang.com";
    changelog = "https://github.com/d2lang/d2/releases/tag/v${version}";
    license = pkgs.lib.licenses.mpl20;
    platforms = builtins.attrNames releases;
    mainProgram = "d2";
    sourceProvenance = [ pkgs.lib.sourceTypes.binaryNativeCode ];
  };
}
