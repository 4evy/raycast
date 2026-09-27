{
  lib,
  buildNpmPackage,
  nodejs_26,
  makeWrapper,
  coreutils,
  gawk,
  gnused,
}:
buildNpmPackage {
  pname = "raycast-manager";
  inherit (lib.trivial.importJSON ../package.json) version;
  nodejs = nodejs_26;
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../package.json
      ../package-lock.json
      ../keydump.cts
      ../bin
      ../src
      ../data
      ../packages/raycast-source/package.json
    ];
  };
  npmDepsHash = "sha256-FZHod8RMK/+mJehkNUXVF+vLQsdZGqhTmafeuiVMhs4=";
  npmInstallFlags = [ "--omit=dev" ];
  dontNpmBuild = true;
  nativeBuildInputs = [ makeWrapper ];
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/lib/raycast" "$out/bin"
    cp -r bin src data node_modules *.cts package.json "$out/lib/raycast/"
    substituteInPlace "$out/lib/raycast/src/application/configure.mts" "$out/lib/raycast/bin/extract-key.sh" \
      --replace-fail /usr/bin/env ${lib.meta.getExe' coreutils "env"}
    substituteInPlace "$out/lib/raycast/data/paths.json" \
      --replace-fail '"defaultsBin": "defaults"' '"defaultsBin": "/usr/bin/defaults"'
    makeWrapper ${lib.meta.getExe nodejs_26} "$out/bin/raycast-manager" \
      --prefix PATH : ${
        lib.strings.makeBinPath [
          coreutils
          gawk
          gnused
        ]
      } \
      --add-flags "$out/lib/raycast/src/cli/main.mts"
    runHook postInstall
  '';
  meta = {
    mainProgram = "raycast-manager";
    description = "Local Raycast configuration tools";
    platforms = [ "aarch64-darwin" ];
  };
}
