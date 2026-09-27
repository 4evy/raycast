{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.raycast;
in
{
  imports = [ ./common.nix ];

  options.programs.raycast = {
    user = lib.options.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = config.system.primaryUser;
      defaultText = lib.options.literalExpression "config.system.primaryUser";
      description = "Desktop user whose Raycast settings are applied";
    };
  };

  config = lib.modules.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.configuration.enable -> cfg.user != null;
        message = "Set programs.raycast.user or system.primaryUser to configure Raycast";
      }
    ];

    system.activationScripts.postActivation.text = lib.modules.mkIf cfg.configuration.enable (
      lib.strings.optionalString (cfg.user != null) ''
        raycast_uid=$(${lib.meta.getExe' pkgs.coreutils "id"} -u ${lib.strings.escapeShellArg cfg.user})
        /bin/launchctl asuser "$raycast_uid" /usr/bin/sudo -H -u ${lib.strings.escapeShellArg cfg.user} -- ${
          pkgs.callPackage ../activation.nix {
            inherit cfg;
            app = "${cfg.package}/Applications/Raycast.app";
            jsonFormat = pkgs.formats.json { };
          }
        }
      ''
    );

    environment.systemPackages = [ cfg.package ];
  };
}
