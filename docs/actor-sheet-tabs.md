# Actor Sheet Tab System

This document explains how Foundry v13 / dnd5e 5.x tab management works, how the SW5E module injects its own tabs into the vehicle sheet, and the rules to follow when writing code that navigates between tabs.

## How Foundry v13 ApplicationV2 Manages Tabs

In Foundry v13, `ApplicationV2`-based sheets manage tab state with two mechanisms:

### 1. CSS visibility — the primary mechanism

```css
.tab[data-tab]:not(.active) { display: none; }
```

Tab panels are shown and hidden by toggling the `.active` class. The `hidden` HTML attribute is **not** the primary visibility control for stock panels — CSS is.

### 2. `app.tabGroups` — the state record

```javascript
app.tabGroups = { primary: "inventory" }
```

`tabGroups` tracks which tab is active per group. It is updated by `app.changeTab()`. **It is not updated automatically when you manipulate classes directly.**

### 3. `app.changeTab(tab, group, options)`

The authoritative API for switching tabs. It:

- Looks up the matching nav element (`.tabs [data-group="${group}"][data-tab="${tab}"]`) — **throws if not found**
- Toggles `.active` on all nav buttons in the group
- Toggles `.active` on all `.tab[data-group="${group}"]` panels
- Updates `tabGroups[group] = tab`

Key option: `{ force: true }` bypasses the early-return guard that does nothing when `tabGroups[group]` already equals `tab`. **Always pass `force: true` when activating a stock tab from custom tab code**, because our custom tab activation does not update `tabGroups`.

## dnd5e 5.x VehicleActorSheet Structure

```
.window-content
├── [data-application-part="sidebarCollapser"]
├── [data-application-part="sidebar"]          — always visible, not a tab
├── [data-application-part="stations"]         — always visible sidebar section (NOT a nav tab)
├── [data-application-part="tabs"]             — renders the primary tab nav
└── #tabs.tab-body
    ├── [data-application-part="inventory"]    tab: "inventory"  (labeled "Cargo")
    ├── [data-application-part="crew"]         tab: "crew"
    ├── [data-application-part="effects"]      tab: "effects"
    └── [data-application-part="description"]  tab: "description"
```

**There is no `"cargo"` tab.** The tab labeled "Cargo" in the UI has `data-tab="inventory"`.

**`stations` is not a nav tab.** It is a sidebar part rendered outside the `#tabs` container. Items that appear in `stations` do not require a tab switch to view — that section is always visible.

The default `tabGroups.primary = "inventory"`.

### Item categorization — what goes where

`VehicleActorSheet._assignItemCategories(item)` determines which part of the stock sheet each item renders in:

```javascript
if ( item.type === "container" )       → inventory tab
if ( item.type === "facility" )        → facilities
if ( item.system.isMountable )         → stations (crew stations list)
if ( "inventorySection" in model )     → inventory tab   ← weapon, equipment, loot, consumable, tool
else                                   → stations (features section)  ← feat, sw5e-module.maneuver
```

**Practical rule for SW5E starship items:**

| Item type | Goes to |
|-----------|---------|
| `feat` (starship actions, features, deployments, ventures) | `stations` sidebar — always visible, no tab switch needed |
| `weapon` (starship weapons) | `inventory` tab |
| `equipment` (reactors, hyperdrives, power couplings) | `inventory` tab |
| `loot` / physical items (modifications) | `inventory` tab |

This matters for "Find in Sheet" navigation: `focusSheetItem` determines the correct tab from the DOM (`.tab[data-group='primary']`). For feat-type items it finds them in `stations` (panel = null → no tab switch, just scroll). For physical items it finds them in the `inventory` panel → switches to the cargo tab then scrolls.

## SW5E Custom Tab Injection

`renderStarshipLayer` (in `starship-sheet.mjs`) hooks into `renderActorSheetV2` and injects two custom tabs into the primary nav:

| Tab ID | Button class | Panel class |
|--------|-------------|-------------|
| `sw5e-starship` | `sw5e-starship-tab-button` | `tab sw5e-starship-tab` |
| `sw5e-starship-features` | `sw5e-starship-tab-button sw5e-starship-features-tab-button` | `tab sw5e-starship-tab sw5e-starship-features-tab` |

Both panels are appended to the primary tab panel container (`panelParent`) with `data-group="primary"` and `data-tab`, so Foundry's `changeTab` naturally includes them when iterating panels.

### Custom tab visibility

Custom tab panels use **both** `.active` class (via Foundry CSS) **and** the `hidden` attribute. Both are set when activating or deactivating custom tabs. This is because CSS alone is sufficient, but `hidden` provides belt-and-suspenders and is reliable when panels are detached and re-attached.

### `_sw5eStarshipActiveTab`

The active custom tab is tracked on `app._sw5eStarshipActiveTab`:

- `"sw5e-starship"` — SW5E tab is active
- `"sw5e-starship-features"` — Features tab is active
- `null` — a stock tab is active (custom tabs hidden)
- `undefined` — initial state before first render (treated as SW5E tab)

This is checked during `renderActorSheetV2` re-renders to restore the correct panel state.

## Rules for Tab Navigation Code

### Activating a custom tab (`activateSheetTab` in `starship-sheet.mjs`)

Call `activatePrimaryTab(root, tabId)` which:
1. Toggles `.active` on nav buttons
2. Toggles `.active` on panels
3. Sets `hidden = true` on inactive custom panels, `hidden = false` on stock panels (stock panels are controlled by CSS, but `hidden` is cleared in case it was set by a previous interaction)

Do **not** call `app.changeTab` for custom tabs — the custom tab IDs are not registered in dnd5e's tab system and will throw.

### Activating a stock tab (`activateSheetTab` in `starship-sheet.mjs`)

1. Set `_sw5eStarshipActiveTab = null`
2. Remove `.active` and set `hidden = true` on all custom panels
3. Call `app.changeTab(tabId, "primary", { force: true, updatePosition: false })`

**Why `force: true`:** Custom tab activation does not update `app.tabGroups`, so `tabGroups.primary` may already equal the target tab. Without `force`, `changeTab` exits early and never restores `.active` on the target panel. The panel stays `display: none` via CSS and the sheet appears blank.

Wrap in try/catch: if `tabId` is not a registered nav tab (e.g., `"stations"`), `changeTab` will throw. The catch block should fall back to `activatePrimaryTab(root, tabId)` or do nothing.

### "Find in Sheet" navigation

When navigating from a custom tab to show an item in the stock sheet:

1. Search for `[data-item-id="${itemId}"]` elements **outside** `.sw5e-starship-tab` panels
2. Check if the found element is inside a `.tab[data-group='primary']` panel
3. If yes → call `activateSheetTab` with `panel.dataset.tab`
4. If no (e.g., item is in the `stations` sidebar section) → **skip tab navigation** and just scroll to the item; the `stations` section is always visible

Do **not** use `data-application-part` as a fallback tab ID. `data-application-part` values like `"stations"` are part IDs, not nav tab IDs, and passing them to `changeTab` throws.

```javascript
// Correct pattern:
const panel = target.closest(".tab[data-group='primary']");
if ( panel?.dataset.tab ) activateSheetTab(root, app, panel.dataset.tab);
target.scrollIntoView({ behavior: "smooth", block: "center" });
```

### Click events in custom panels

Custom panel click handlers (delegated on the panel element) should use `event.preventDefault()` for action buttons. Do **not** add `event.stopPropagation()` unless you have a specific reason — stopping propagation can interfere with navigation actions that depend on the event reaching ancestor handlers.

### Tab buttons in custom panels

Do not put `data-action="tab"` on non-nav elements (e.g., action buttons) even if they have a `data-tab` attribute. Foundry's `_onClickTab` handler reads `data-action="tab"` to detect tab switches. A button with only `data-tab` (no `data-action`) will not trigger Foundry's tab system.

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Sheet goes blank after tab switch | `changeTab` called without `force: true`; `tabGroups` already matches target tab, so it exits early and never restores `.active` on the target panel | Pass `{ force: true }` |
| Features tab blanks out after "Find in Sheet" | `data-application-part` fallback resolves to `"stations"` (not a nav tab); `changeTab` throws; catch falls to `activatePrimaryTab` which deactivates all panels | Only resolve tab ID from `.tab[data-group='primary']`, not `data-application-part` |
| Custom tab button stays highlighted after navigating away | Custom button `.active` not removed; `app.changeTab` handles this automatically when `force: true` is used | Ensure stock-tab path calls `app.changeTab` with `force: true` |
| Stock tab button click dispatched as a synthetic event | `changeTab` exits early (same reasons above); using `dispatchEvent` bypasses the `force` option | Use `app.changeTab` directly instead of synthesizing click events |
| `scrollIntoView` on a tab panel item does nothing | Panel was `display:none` when `scrollIntoView` was called; browser has not yet painted the `display:block` change | Wrap `scrollIntoView` in `window.requestAnimationFrame(...)` after `activateSheetTab` |
