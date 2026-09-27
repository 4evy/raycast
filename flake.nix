{
  description = "Raycast for macOS, updated independently of nixpkgs";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs";

  outputs =
    inputs:
    let
      system = "aarch64-darwin";
      pkgs = import inputs.nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };
      raycast = pkgs.callPackage ./nix/package.nix { };
    in
    {
      packages.${system} = {
        inherit raycast;
        raycast-manager = pkgs.callPackage ./nix/manager.nix { };
        default = raycast;
      };
      darwinModules = {
        raycast = {
          _class = "darwin";
          _file = __curPos.file;
          imports = [ ./nix/modules/nix-darwin.nix ];
        };
        default = inputs.self.darwinModules.raycast;
      };
      homeManagerModules = {
        raycast = {
          _class = "homeManager";
          _file = __curPos.file;
          imports = [ ./nix/modules/home-manager.nix ];
        };
        default = inputs.self.homeManagerModules.raycast;
      };
    };
}
