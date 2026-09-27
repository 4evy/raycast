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

  config = lib.modules.mkIf cfg.enable {
    home.packages = [ cfg.package ];
    home.activation.raycast = lib.modules.mkIf cfg.configuration.enable (
      lib.hm.dag.entryAfter [ "linkGeneration" ] ''
        run ${
          (pkgs.callPackage ../activation.nix {
            inherit cfg;
            app = "${cfg.package}/Applications/Raycast.app";
            jsonFormat = pkgs.formats.json { };
          })
        }
      ''
    );
  };
}
