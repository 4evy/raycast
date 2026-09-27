{
  lib,
  raycast,
  fetchurl,
}:
let
  release = lib.trivial.importJSON ../release.json;
in
raycast.overrideAttrs (_old: {
  inherit (release) version;
  src = fetchurl {
    name = "Raycast.dmg";
    inherit (release) url hash;
  };
})
