{
  lib,
  callPackage,
  writeShellScript,
  formats,
  cfg,
}:
let
  manager = callPackage ./manager.nix { };
  configFile =
    if cfg.configuration.settings != null then
      (formats.json { }).generate "raycast-config.json" cfg.configuration.settings
    else if builtins.isPath cfg.configuration.configFile then
      builtins.path {
        path = cfg.configuration.configFile;
        name = "raycast-config.json";
      }
    else
      cfg.configuration.configFile;
in
writeShellScript "configure-raycast" ''
  set -eu
  export RAYCAST_APP_BUNDLE=${lib.strings.escapeShellArg "${cfg.package}/Applications/Raycast.app"}
  export RAYCAST_APP="$RAYCAST_APP_BUNDLE"
  ${lib.meta.getExe manager} configure ${lib.strings.escapeShellArg (lib.trivial.defaultTo "" configFile)}
''
