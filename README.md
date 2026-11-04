# Raycast

Read and configure Raycast's local database from JSON, the CLI, or TypeScript.
Supports profiles, command aliases, themes, and disabling AI.

Requires Apple Silicon macOS and Node.js 26.10.0 or newer.

## Get started

```sh
npm ci
npm run key -- extract
npm run db -- status
```

Run in a logged-in desktop session and allow Keychain access if prompted.
Extraction reads Raycast's database-key backup from the login Keychain and
caches the derived passphrase with mode 0600. Later runs reuse the cache.
Raycast starts only if its runtime is missing.

## Configure

Save as `raycast-config.json`:

```json
{
  "$schema": "./schemas/config.schema.json",
  "disableAi": true,
  "launch": true
}
```

```sh
npm run configure -- ./raycast-config.json
```

Omitted fields leave settings unchanged. Configuration writes immediately,
without rollback or a dry-run mode. `disableAi: false` does not restore AI.

The [configuration schema](schemas/config.schema.json) covers profiles,
application and command aliases, clipboard retention, and theme files. Asset
paths resolve relative to the configuration file. Absolute paths and `~` also
work. Applying a profile clears local OAuth session defaults.

- Inspect your profile with `npm run db -- profile get`.
- Find built-in command IDs with `npm run db -- api builtin [filter]`.
- Use the [theme schema](schemas/themes.schema.json) for `themesFile`, or
  install themes directly with `npm run themes -- ./themes.json`. Theme changes
  restart Raycast, and the last theme for each appearance becomes active.

## Disable or restore AI

```sh
npm run ai -- disable --dry-run
npm run ai -- disable
npm run ai -- restore
```

Disabling saves a backup, then applies the [AI policy](data/ai/disable.json).
It disables built-in AI features, including dictation and translation, and
clears BYOK keys and skill directories. Normal commands, chat history, and
third-party extensions remain. Restore uses the saved backup.

Restart Raycast after disabling or restoring AI. Some inline AI actions may
remain visible. This is not a network firewall, and startup or account refresh
can still discover models.

Incompatible backups stop both operations before settings change. Preserve the
old backup before moving it aside. A new backup captures only current settings,
not values missing from the old file.

## Other interfaces

### CLI

Browse commands with `npm run cli -- --help` or a command group's `--help`.
Profile, alias, user-default, and AI mutations support `--dry-run`.

### TypeScript

Run `npm pack`, install the resulting tarball in your project, and import from
`raycast/v1`. Use `configureFile(path)` to apply JSON, or
`createRaycastClient()` for individual operations. See the
[API contracts](src/public/v1/contracts.ts) for available methods and types.

### Nix

Add this checkout as a flake input and import
`inputs.raycast.darwinModules.raycast` or
`inputs.raycast.homeManagerModules.raycast`:

```nix
{
  nixpkgs.config.allowUnfree = true;
  programs.raycast = {
    enable = true;
    configuration.settings = {
      disableAi = true;
      launch = true;
    };
  };
}
```

Alternatively, set `programs.raycast.configuration.configFile` to an existing
JSON file. Set only one configuration form, or omit both to install only the
app. Settings enter the Nix store, so keep secrets out and use absolute asset
paths. nix-darwin needs `system.primaryUser` or `programs.raycast.user`.
See the [Nix modules](nix/modules/) for options.

## Development

Run `npm run check` for type checking, linting, build, and package/API checks.
Use `npm run format` to format code and `npm run api:update` after public API
changes. Source extraction and release commands are listed in
[package.json](package.json).
