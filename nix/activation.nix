{
  lib,
  callPackage,
  writeShellScript,
  cfg,
  app,
  jsonFormat,
}:
let
  manager = callPackage ./manager.nix { };
  configFile =
    if cfg.configuration.settings != null then
      jsonFormat.generate "raycast-config.json" cfg.configuration.settings
    else
      cfg.configuration.configFile;
in
writeShellScript "configure-raycast" ''
  set -eu
  export RAYCAST_APP_BUNDLE=${lib.strings.escapeShellArg app}
  case "$RAYCAST_APP_BUNDLE" in
    '~/'*) RAYCAST_APP_BUNDLE="$HOME/''${RAYCAST_APP_BUNDLE#\~/}" ;;
  esac
  export RAYCAST_APP="$RAYCAST_APP_BUNDLE"
  ${lib.meta.getExe manager} configure ${lib.strings.escapeShellArg (lib.trivial.defaultTo "" configFile)}
''
