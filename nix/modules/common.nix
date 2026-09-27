{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.raycast;
  jsonFormat = pkgs.formats.json { };
in
{
  options.programs.raycast = {
    enable = lib.options.mkEnableOption "Raycast";
    configuration = {
      enable = lib.options.mkEnableOption "applying the consumer configuration during activation" // {
        default = cfg.configuration.configFile != null || cfg.configuration.settings != null;
        defaultText = lib.options.literalExpression "configFile != null || settings != null";
      };
      configFile = lib.options.mkOption {
        type = lib.types.nullOr lib.types.nonEmptyStr;
        default = null;
        example = "/path/to/raycast-config.json";
        description = "Runtime path to consumer JSON configuring profile, aliases, AI policy, and themes";
      };
      settings = lib.options.mkOption {
        type = lib.types.nullOr (lib.types.attrsOf jsonFormat.type);
        default = null;
        example = {
          disableAi = true;
          launch = true;
        };
        description = "Raycast configuration as Nix values, generated as JSON in the Nix store";
      };
    };
    package = lib.options.mkPackageOption pkgs "raycast" { } // {
      default = pkgs.callPackage ../package.nix { };
      defaultText = lib.options.literalExpression "pkgs.callPackage raycast/nix/package.nix { }";
    };
  };

  config = lib.modules.mkIf cfg.enable {
    assertions = [
      {
        assertion =
          cfg.configuration.enable
          -> (cfg.configuration.configFile != null) != (cfg.configuration.settings != null);
        message = "Set exactly one of programs.raycast.configuration.configFile or settings";
      }
      {
        assertion = pkgs.stdenv.hostPlatform.system == "aarch64-darwin";
        message = "programs.raycast supports only Apple Silicon macOS";
      }
    ];
  };
}
