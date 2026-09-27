# Raycast

<p align="center">
  <img src="https://img.shields.io/badge/macOS-Apple_Silicon-111827?style=flat-square&amp;logo=apple&amp;logoColor=white" alt="Apple Silicon macOS">
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A526.10.0-417E38?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 26.10.0 or newer">
  <img src="https://img.shields.io/badge/TypeScript-API_v1-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="TypeScript API v1">
</p>

Read and configure Raycast's local database from JSON, the CLI, or TypeScript.
Supports profiles, command aliases, themes, and disabling AI.

## Quick start

```sh
npm ci
npm run key -- extract
npm run db -- status
```

Run in a logged-in desktop session. The first key extraction will restart
Raycast, later runs reuse the cached key

## Configure with JSON

`raycast-config.json` — disable AI and open Raycast:

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

Omitted fields leave settings unchanged. `disableAi: false` does not restore AI;
use `npm run ai -- restore`. Configuration writes immediately and has no
rollback or dry-run mode.

### Profile, aliases, and themes

A combined configuration with `clip` for Clipboard History:

```json
{
  "$schema": "./schemas/config.schema.json",
  "profile": {
    "currentUser": {
      "id": "your-id",
      "name": "Your Name",
      "has_pro_features": true
    },
    "avatarFile": "avatar.png"
  },
  "commandAliases": [
    {
      "id": "c:r:clipboard-history::-::history",
      "extensionId": "e:r:clipboard-history",
      "alias": "clip",
      "enabled": true
    }
  ],
  "themesFile": "themes.json",
  "disableAi": true,
  "launch": true
}
```

Asset paths resolve relative to the configuration file; absolute paths and `~`
also work.

- **Profile:** replace the example with your own fields from
  `npm run db -- profile get`. Applying it replaces the stored profile and
  clears local OAuth session defaults. Use `avatarUrl` instead of `avatarFile`
  for a remote image; avatar failures produce warnings.
- **Local Pro:** `has_pro_features` enables the **Unlimited** option under
  Clipboard History -> **Keep history for**. Select it afterward; organization
  policy can override it
- **Aliases:** set `alias` to `null` to remove one, or `enabled` to `false` to
  disable the command. Omit `enabled` to preserve its value. Unlisted commands
  stay unchanged. Find IDs with `npm run db -- api builtin [filter]`.
- **Application aliases:** use `appAliases` to find applications by their
  indexed names and generate Raycast command IDs. Names are tried in order.
  If none match, `fallbackPath` supplies the command path; without it, the
  alias is skipped with a warning. `commandAliases` still handles built-in
  commands.
- **Existing profile:** use `fallbackUser` and `currentUserPatch` instead of
  `currentUser` to keep stored profile fields. The fallback supplies `id` and
  `name` when no profile exists; patch fields override the stored values.

The [configuration schema](schemas/config.schema.json) lists supported fields.
This format does not accept arbitrary Raycast settings.

### Theme file

Save as `themes.json` for the configuration above:

```json
{
  "themes": [
    {
      "name": "Midnight",
      "appearance": "dark",
      "colors": {
        "background": "#181825",
        "backgroundSecondary": "#1E1E2E",
        "foreground": "#CDD6F4",
        "accent": "#CBA6F7",
        "selection": "#45475A",
        "loader": "#89B4FA",
        "red": "#F38BA8",
        "orange": "#FAB387",
        "yellow": "#F9E2AF",
        "green": "#A6E3A1",
        "blue": "#89B4FA",
        "purple": "#CBA6F7",
        "magenta": "#F5C2E7"
      }
    }
  ]
}
```

The last theme for each appearance becomes active. Changes restart Raycast.
To install themes alone:

```sh
npm run themes -- ./themes.json
```

## Disable or restore AI

```sh
npm run ai -- disable --dry-run
npm run ai -- disable
npm run ai -- restore
```

Disabling saves a backup, then applies the [AI policy](data/disable-ai.json). It
disables built-in AI features, including dictation and translation, and clears
BYOK keys and skill directories. Chat history and third-party extensions remain.
Restore uses the saved backup.

If an existing backup is incompatible, disable and restore stop before changing
settings. Keep the old file and move it aside before disabling AI again. The new
backup captures the current settings; it cannot recover values missing from the
old file. Dry runs check existing backups too.

## CLI

Use `npm run cli -- --help` or a command group's `--help` to browse commands.
Profile, alias, user-default, and AI mutations support `--dry-run`.

```sh
npm run db -- summary
npm run db -- compatibility
npm run db -- user defaults get your-setting-key
npm run db -- user defaults set --help
```

## TypeScript library

Run `npm pack`, then install the tarball in your project:

```sh
npm install /path/to/raycast-1.0.0.tgz
```

The examples below run as `.mts` files on Node 26.10.0+. Profile and theme
scripts preview by default; `--apply` writes changes. Key extraction may restart
Raycast. See the [API contracts](src/public/v1/contracts.mts) for the full API,
or use `configureFile(path)` to apply a JSON configuration.

<details>
<summary>Update an existing profile and disable AI</summary>

Preserve existing profile fields and enable local Pro. Applying clears OAuth
session defaults; the AI backup does not cover the profile.

`local-setup.mts`:

```typescript
import { parseArgs } from "node:util";
import {
  createRaycastClient,
  extractDatabaseKey,
  parseConsumerConfig,
} from "raycast/v1";

const { values } = parseArgs({
  options: { apply: { type: "boolean", default: false } },
});
const dryRun = !values.apply;

await extractDatabaseKey();
const raycast = createRaycastClient();
const { status } = await raycast.database.status();
if (!status.allHealthy) throw new Error("Raycast database health check failed");

const { currentUser } = await raycast.profile.get();
const { profile } = parseConsumerConfig({ profile: { currentUser } });
if (!profile) throw new Error("Expected a validated profile");

await raycast.profile.apply(
  { ...profile.currentUser, has_pro_features: true },
  { dryRun },
);
console.log(dryRun ? "Profile validated" : "Profile updated");

const ai = await raycast.ai.disable({ dryRun });
console.log({ dryRun, aiChanges: ai.changes.length });
if (!dryRun) console.log({ aiBackup: ai.backup });
```

```sh
node local-setup.mts
node local-setup.mts --apply
```

</details>

<details>
<summary>Generate light and dark themes from a shared palette</summary>

Map a shared palette to Raycast colors. `--apply` also writes
`workbench-themes.json`, which can be reused as `themesFile`.

`sync-themes.mts`:

```typescript
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  createRaycastClient,
  extractDatabaseKey,
  installThemes,
  themesFromPalette,
  type ThemeColor,
} from "raycast/v1";

const { values } = parseArgs({
  options: { apply: { type: "boolean", default: false } },
});

const accents = {
  red: "#D64550",
  orange: "#D97732",
  yellow: "#C49A24",
  green: "#48966B",
  blue: "#487CC7",
  purple: "#9065C4",
  pink: "#C65E9B",
};
const palettes = {
  light: {
    ...accents,
    base: "#FAF8F5",
    surface: "#F0EDE8",
    text: "#292D35",
    highlight: "#DDD6EC",
  },
  dark: {
    ...accents,
    base: "#191B22",
    surface: "#242731",
    text: "#E4E6ED",
    highlight: "#3C3550",
  },
};

type PaletteKey = keyof (typeof palettes)[keyof typeof palettes];

const themes = themesFromPalette("Workbench", palettes, {
  background: "base",
  backgroundSecondary: "surface",
  foreground: "text",
  accent: "purple",
  selection: "highlight",
  loader: "blue",
  red: "red",
  orange: "orange",
  yellow: "yellow",
  green: "green",
  blue: "blue",
  purple: "purple",
  magenta: "pink",
} satisfies Record<ThemeColor, PaletteKey>);

await extractDatabaseKey();
const raycast = createRaycastClient();
const preview = await raycast.themes.apply(themes, { dryRun: true });
console.log({ wouldChange: preview.changed });

if (values.apply) {
  const file = new URL("./workbench-themes.json", import.meta.url);
  await writeFile(file, `${JSON.stringify({ themes }, null, 2)}\n`);
  const { changed } = await installThemes(fileURLToPath(file));
  console.log({ changed });
}
```

```sh
node sync-themes.mts
node sync-themes.mts --apply
```

</details>

<details>
<summary>Print the database encryption key and inspect database health</summary>

Write the key to stdout and database health to stderr. Keep stdout out of
shared logs.

`database-key.mts`:

```typescript
import { readFile } from "node:fs/promises";
import { createRaycastClient, extractDatabaseKey } from "raycast/v1";

await extractDatabaseKey();
const raycast = createRaycastClient();
const { keyFile, status } = await raycast.database.status();
if (!keyFile) throw new Error("Database key cache was not found");

const key = (await readFile(keyFile, "utf8")).trim();
if (!key || key.includes("\0")) {
  throw new Error("Expected a nonempty text key in the runtime cache");
}

console.error({ allHealthy: status.allHealthy });
console.error(
  status.databases.map((database) => ({
    type: database.databaseType,
    accessible: database.isAccessible,
    encrypted: database.isEncrypted,
  })),
);
process.stdout.write(`${key}\n`);
```

```sh
node database-key.mts
```

</details>

## Nix

Add this checkout to your flake:

```nix
inputs.raycast.url = "path:/absolute/path/to/raycast";
inputs.raycast.inputs.nixpkgs.follows = "nixpkgs";
```

Import `inputs.raycast.darwinModules.raycast` or
`inputs.raycast.homeManagerModules.raycast`, then choose one configuration form:

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

Or use an existing JSON file:

```nix
programs.raycast = {
  enable = true;
  configuration.configFile = "/path/to/raycast-config.json";
};
```

Set only one form; omit both to install only the app. Nix settings go into the
Nix store, so keep secrets out and use absolute paths for `avatarFile` and
`themesFile`. The JSON file stays at its runtime path. nix-darwin needs
`system.primaryUser` or `programs.raycast.user`.

For a profile and aliases that depend on the local Raycast database, use Nix
settings directly. Activation resolves application names after Raycast starts:

```nix
programs.raycast.configuration.settings = {
  profile = {
    fallbackUser = { id = "your-id"; name = "Your Name"; };
    currentUserPatch.has_pro_features = true;
    avatarUrl = "https://example.com/avatar.png";
  };
  appAliases = [
    { names = [ "Zen Browser (Twilight)" "Zen Browser" ]; alias = "firefox"; }
  ];
  commandAliases = [
    {
      id = "c:r:clipboard-history::-::history";
      extensionId = "e:r:clipboard-history";
      alias = "clip";
    }
  ];
  disableAi = true;
};
```

## Development

`npm run check` runs type checking, linting, build, and package/API checks.
`npm run format` formats code. After public API changes, run
`npm run api:update` and review the report.

Refresh source catalogs with `npm run source:sync` and `npm run source:api`.
`npm run release:update` updates the pinned release. Dependency changes
also require refreshing `npmDepsHash` in [nix/manager.nix](nix/manager.nix).
