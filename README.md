![](https://img.shields.io/badge/Foundry-v13-informational)
![Latest Release Download Count](https://img.shields.io/github/downloads/sw5e-foundry/sw5e-module/latest/module.zip) 

# SW5E

Implementation of the sw5e system as a module for dnd5e.

Current target compatibility: Foundry VTT `13` with `dnd5e` `5.2.5`.

## Installation

This module is not listed on Foundry's website or in the in-app Module Repository because it contains homebrew content.

### Install The Latest Release

If you want the newest release, open Foundry's `Install Module` window and paste this URL into the `Manifest URL` box at the bottom:

https://github.com/sw5e-foundry/sw5e-module/releases/latest/download/module.json

### Install A Specific Release

If you want a specific version instead of the latest one:

1. Open the [Releases page](https://github.com/sw5e-foundry/sw5e-module/releases).
2. Open the release you want to install.
3. Copy the link to that release's `module.json` artifact.
4. In Foundry, open `Add-on Modules` -> `Install Module`.
5. Paste the link into the `Manifest URL` box at the bottom of the window.
6. Click install.

If you wish to manually install the module, clone or extract it into the `Data/modules/sw5e-module` folder. You may do this by cloning the repository or downloading a zip archive from the Releases Page.

## Local Development

This repository is the editable source for the `sw5e-module` Foundry module. For local work, use Foundry VTT `13.351`, the `dnd5e` system `5.2.5`, and the `lib-wrapper` module.

If your local repository is linked into Foundry's `Data/modules/sw5e-module` folder with a junction or symlink, most code and template changes can be tested by refreshing Foundry after you save your edits.

Compendium content is different:

- Edit the source JSON in `packs/_source/`
- Rebuild the generated compendium databases with `npm run build:db`
- Reload Foundry and verify the updated compendium entries in your test world

The `packs/` folder is generated output and should not be edited by hand. The source of truth is `packs/_source/`.

For a plain-English walkthrough of what is safe to edit, when to rebuild, and a copy/paste template for reporting a bug or requesting a change, see [docs/local-setup.md](docs/local-setup.md).

## Developer Documentation

For a contributor-focused overview of the repo layout, runtime entrypoints, compendium build pipeline, and release packaging, see [docs/developer-guide.md](docs/developer-guide.md).

## Included Legacy Content

The module includes Heretic's Guide to the Galaxy species content as dedicated baked-in compendiums instead of mixing it into the core species lists:

- `HGTTG Species`
- `HGTTG Species Features`

## Changelog

### [1.3.0] - 2026-04-03

### Added

- Optional Star Wars currencies with GM-managed enablement, custom exchange rates, and exchange-rate tooltips integrated into actor wallets and item price denomination selectors.
- Baked-in Heretic's Guide to the Galaxy species compendiums, published as dedicated `HGTTG Species` and `HGTTG Species Features` packs with migrated artwork and V13 / `dnd5e` 5.2.5-compatible data.

### Changed

- Currency support now follows the dnd5e multi-denomination workflow more closely, including wallet normalization for existing actors and better compatibility with convert and transfer actions.
- The SW currency configuration app now uses the module namespace correctly, appears under `SW5E` in settings, and supports a bounded scrollable layout.
- Legacy HGTTG species are now separated from the main `Species` compendium instead of being merged into the core species roster.
- Repository line-ending rules are now pinned with `.gitattributes` so generated compendium source files behave consistently across Windows and non-Windows development environments.
- Vehicle-backed starships are now the authoritative SW5E runtime path, with legacy and character-backed starship data normalized into the vehicle sheet workflow during migration and pack conversion.
- Starship sheet navigation now presents `SotG` and `SotG Features` ahead of the stock tabs, while hiding the stock `Features` tab on SW5E starship sheets so the remaining tabs can use the full width.

### Fixed

- Force and Tech point editing on character and NPC sheets, including current-point save behavior, post-bonus max handling, repeated save drift, and edit access from the cog-only sheet control.
- The redundant Power Point Controls panel on actor sheets has been removed.
- Currency fields now render correctly on the Inventory tab for enabled denominations, and tooltip text no longer shows unresolved placeholders.
- Legacy image migration no longer replaces actor and vehicle avatars with the loot bag icon, and affected worlds are repaired during migration.
- Stale dnd5e image references in migrated data and compendium content no longer cause repeated missing-image errors.
- Starship compendium builds now preserve vehicle-backed system data such as `details.type`, and migrated starships retain their SW5E movement, travel, crew, and routing data more consistently.

### [1.2.9] - 2026-03-13

### Added

- Local development and contributor documentation, including install instructions and a plain-English change request template.
- A guided legacy world conversion tool for migrating older SW5E worlds into the module workflow.
- Vehicle-backed starship sheets with custom `SW5E` and `Features` tabs, starship skill rolls, travel and hyperdrive displays, crew-aware summaries, and starship item quick actions.

### Changed

- Starship movement now uses a derived runtime for flying speed, turning speed, travel pace, hyperdrive, crew state, and power-routing effects.
- Force and Tech point sheet support has been expanded to better match the dnd5e sheet workflow across character and NPC use cases.
- Compendium and migration handling has been hardened for legacy SW5E data and newer dnd5e data expectations.

### Fixed

- Foundry V13 and dnd5e 5.2.5 compatibility issues across starship sheets, roll dialogs, migration, item activity normalization, and deprecated roll/application APIs.
- Multiple starship sheet issues affecting warnings dialogs, tab visibility, sidebar summaries, skill rolls, and ship weapon interactions.
- Powercasting sheet display issues, medpac syntax/runtime problems, and reload-related item workflow regressions.

### [1.2.8] - 2025-12-14

### Fixed

- Weapon Templates on Attacks.
- Powercasting Cards on Sheets.
- DnD5e 5.2 Conflict/Incompatibility.

### [1.2.7] - 2025-11-21

### Added

- Unify art style for images of conditions.

### Fixed

- Tool Proficiencies on Character Sheet.
- Enhanced property on Weapons and Equipment.
- Image rendering of icon for damage type of energy, ion, kinetic, etc.

### [1.2.6] - 2025-10-31

### Added

- Conditions now have descriptions and images.

### Fixed

- Powercasting Bars on Character Sheet.
- Classes now have additional labels within their details to specify Powercasting and Maneuver progression.
- Equipments and Weapons now have specific configuration labels for their special Properties.

### [1.2.5] - 2025-03-03

### Changed

- Module is now compatible with and requires dnd5e 4.3.x.

### [1.2.4] - 2025-02-12

### Added

- Consumable type and subtypes for explosives.

### Changed

- Compendium updates.

### [1.2.3] - 2025-02-09

### Added

- Backgrounds now have advancements granting their skill and language proficiencies.

### Changed

- Compendium Updates.

### [1.2.2] - 2024-12-05

### Added

- Force/Tech Points will now be displayed as bars bellow hit points.

### Changed

- Compendium Updates.

### Fixed

- Dropping powers on powercasters now properly set them to 'powercasting' preparation.
- Power 'properties' are no longer automatically added on opening their sheet.

### [1.2.1] - 2024-11-27

### Changed

- Compendium Updates.

### Fixed

- The UI for editing numeric item properties should once again work.

### Removed

- Reload system temporarily removed.


### [1.2.0] - 2024-11-26

### Added

- Compatibility with dnd5e 4.1.0.

### Fixed

- Superiority progression selectors will no longer show up as 'nulldnull dice' when not available.

### [1.1.0] - 2024-09-13

### Added

- Support for Maneuvers and Superiority 'casting'.

### Fixed

- Compendium Powers now have their resource consumption set to use the correct amount of power points.
- Powercasting and Superiority progression selectors will now be properly disabled on non editable class sheets (unowned or on locked compendia).

### [1.0.0] - 2024-08-29

### Added

- Compendium Powers now have their resource consumption set to use power points.
- Migration.

### Changed

- Module name changed from `sw5e-module-test` to `sw5e`.
- Github repository ownership changed to the `sw5e-foundry` organization.

### Fixed

- Adde missing localization for Power and Shield dice.
- Powerbook tab should properly populate with sections for available powercasting levels.

### [0.18] - 2024-08-23

### Added

- Item IDs for specific proficiencies and base items.

### Fixed

- Compendium item advancements should now use the correct ids for tool and blaster proficiencies.
- Compendium weapons should no longer have wrong properties due to their descriptions.

### [0.17] - 2024-08-13

### Added

- Reload Property automation.
- Very minor rapid/burst automation (when the item action is set to 'saving throw', the base ammo cost is set to the rapid/burst value).

### Fixed

- Compendium items should now have the correct ids on the advancements.
- Compendium species should no longer have active effects that change proficiencies, senses, movement, or any other traits handled by the species item and advancements.
- Compendium classes and archetypes should have the proper powercasting progression.

### [0.16] - 2024-08-01

### Fixed

- Compendium Packs should now actually be included in the release.

### [0.15] - 2024-07-30

### Added

- Compendium Packs - This is highly experimental and untested, the majority of the items are untested.

### Fixed

- NPC sheets and unowned powers should no longer fail to open.

### [0.14] - 2024-07-29

### Changed

- Force/Tech Powers now use the proper ability scores and respect max power level.

### [0.13] - 2024-07-24

#### Added

- Powercasting

### [0.1] - 2024-07-22

#### Added

- Localization overrides (I.E: Spell -> Power, Subclass -> Archetype, Race -> Species...)
- Skills (lore, piloting, tech)
- Weapon types (blaster, lightweapon, vibroweapon)
- Tool types (specialist's kits)
- Creature types (droid, force)
- Equipment types (wristpad, focus generator, starship armor, starship equipments)
- Ammunition types (power cell, cartridge...)
- Feature types (invocations, customization options, deployments...)
- Item properties (auto, burst, keen...)
- Galactic Credits
- Damage types (ernegy, ion, kinetic)
- Higher proficiency levels (only display, no automation)
- Conditions (corroded, ignited, shocked, slowed...)
- Languages
- Character flags (Maneuver Critical Threshold, Force/Tech Power discount, Supreme XYZ, Encumbrance Multiplier) (only display, no automation)
- Source Books (PHB, SnV, WH...)
- Numeric Item Properties can have their values set correctly
- Keen property automated
