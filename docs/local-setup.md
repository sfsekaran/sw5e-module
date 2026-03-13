# Local Setup And Workflow

This guide is written for working on the `sw5e-module` repository without needing a programming background.

## What This Repo Is

`sw5e-module` is a FoundryVTT module that layers SW5E content and behavior on top of the `dnd5e` system.

This repo currently targets:

- Foundry VTT `13.351`
- `dnd5e` `5.2.5`
- `lib-wrapper` enabled in the test world

## Where The Module Usually Lives

Foundry loads modules from its `Data/modules/` folder. On Windows, the default Foundry `Data` folder is usually under `%localappdata%/FoundryVTT/Data`, but your installation may use a different location.

If you are using a junction or symlink, the repository itself can stay in a normal working folder while still appearing to Foundry as `Data/modules/sw5e-module`.

## What The Separate `sw5e` Folder Is

The separate `sw5e` folder is a reference system folder for older Foundry compatibility. Treat it as read-only reference material while working on this module.

For work related to this repository, only edit files inside `sw5e-module`.

## Safe Places To Edit

These folders are normal places to make changes:

- `packs/_source/` for compendium source data
- `scripts/` for module behavior and compatibility patches
- `applications/` for custom application code
- `templates/` for sheet or UI templates
- `styles/` for CSS styling
- `languages/` for localization text
- `icons/` for images and assets
- `README.md` and `docs/` for documentation

## Do Not Edit These By Hand

- `packs/` because it is generated output
- `node_modules/` because it is installed automatically
- the separate `sw5e` reference folder unless you intentionally start a different project

The most important rule is:

- edit `packs/_source/`
- build into `packs/`

## The Difference Between `packs/_source` And `packs`

`packs/_source/` contains editable JSON files. This is where compendium changes should be made.

`packs/` contains generated compendium databases used by Foundry. These files are rebuilt from `packs/_source/` and are ignored by git on purpose.

If you change a compendium item and do not rebuild, Foundry will still be using the old generated data.

## Normal Workflow

### If You Change Compendium Content

1. Edit the relevant file in `packs/_source/`.
2. Run `npm run build:db` from the `sw5e-module` folder.
3. Reload Foundry.
4. Open the affected compendium entry and confirm the change appears in the world.

### If You Change Code, Templates, Styles, Or Localization

1. Edit the relevant file in `scripts/`, `applications/`, `templates/`, `styles/`, or `languages/`.
2. Reload Foundry.
3. Test the feature that was changed.

You usually do not need `npm run build:db` for code-only changes unless those changes also depend on updated compendium data.

## Commands You Will Use

- `npm install`
  Installs the tools used by this repo. It also runs a compendium build automatically after install.
- `npm run build:db`
  Builds the editable compendium JSON in `packs/_source/` into Foundry-ready compendium data in `packs/`.
- `npm run build:json`
  Extracts built compendium data back into JSON source files.
- `npm run build:clean`
  Cleans and normalizes compendium source data.

## Testing Assumptions

Unless a task says otherwise, the default test setup should be:

- Foundry VTT `13.351`
- `dnd5e` `5.2.5`
- `lib-wrapper` installed and enabled
- a normal test world using the standard `dnd5e` sheets

If you also use other sheet modules or UI modules, mention that when reporting problems because it can change how the module behaves.

## Recommended Test Checks

After changes, the most useful things to verify are:

- the module loads without startup errors
- actors and items open normally
- powers and maneuvers appear in the expected sheet areas
- compendium entries open and import correctly
- any edited item, class, feat, species, or monster shows the expected data in Foundry

## Troubleshooting

### `lib-wrapper` Is Missing

If `lib-wrapper` is not installed or not enabled, some module patches may not work correctly. Install it and enable it in the world before testing.

### Wrong Foundry Or `dnd5e` Version

This repo is being maintained for Foundry `13.351` and `dnd5e` `5.2.5`. If your local versions do not match, odd bugs may be version mismatch issues instead of real module bugs.

### I Edited Something But Nothing Changed In Foundry

If you changed a file under `packs/_source/`, run `npm run build:db` and then reload Foundry.

If you changed code or templates, reloading the Foundry page is usually enough.

### I Am Not Sure Which File To Edit

Use this shortcut:

- compendium entry change -> `packs/_source/`
- sheet behavior change -> `scripts/` or `applications/`
- visible layout change -> `templates/` or `styles/`
- wording or labels -> `languages/`

## What To Include When Requesting A Fix

When asking for help with this repo, include:

- what you were trying to change
- the compendium entry, actor, item, or feature involved
- what you expected to happen
- what actually happened
- whether you already ran `npm run build:db`
- whether the problem happens in a plain `dnd5e` world with only `lib-wrapper` and this module enabled

That information usually saves a lot of time and avoids guesswork.
