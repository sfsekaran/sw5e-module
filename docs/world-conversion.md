# Legacy SW5E World Conversion

This guide is for converting data from an older world that used the legacy `sw5e` system into a world that uses:

- `dnd5e` system
- `sw5e-module` enabled

## Important Safety Notes

- Do **not** run conversion in your only copy of the world.
- Always make a backup first.
- Run a **dry run** before writing any documents.

## Recommended Workflow

1. Back up your legacy world.
2. Create a fresh world on `dnd5e`.
3. Enable `sw5e-module`.
4. Open **Game Settings -> Configure Settings -> Module Settings -> SW5E Legacy World Conversion**.
5. Paste your exported legacy world JSON payload.
6. Keep **Dry run** enabled and run once.
7. Review warnings/errors in the report dialog.
8. Disable **Dry run** and run conversion again.
9. Reload the world and verify actors, items, scenes, journals, tables, and macros.

## Payload Shape

The converter accepts a JSON object with any of these top-level arrays:

- `actors`
- `items`
- `scenes`
- `journalEntries` (or `journal` / `journals`)
- `rollTables` (or `tables`)
- `macros`
- `compendia` (optional, array of `{ collection, documents }`)

Only include document types you actually need to import.

## Macro Launcher (Optional)

You can open the conversion tool from a macro:

```js
if (!game.user.isGM) return ui.notifications.warn("GM only.");
globalThis.sw5e?.openWorldConversionTool?.();
```

## What This Converter Handles

- Legacy item type remaps (for example `power`, `species`, `archetype`, deprecated feat-like types, and legacy starship item variants)
- Legacy starship actor/item normalization
- Legacy image and compendium-link normalization
- Macro, roll table, journal page, scene, actor, and item migration helpers

## What To Verify After Conversion

- World opens with no errors.
- Character and NPC sheets prepare correctly.
- Starships open and render expected SW5E starship UX.
- Journals and roll tables have valid links/images.
- Macros that reference old links are updated where possible.
