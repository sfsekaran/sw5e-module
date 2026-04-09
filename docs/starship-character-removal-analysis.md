# Starship Character Refactor: Thoroughness Review

Analysis date: 2026-04-03

## 1. Confirmation: Removed Code Was Dead / Character-Backed Only

**Confirmed.** The removed code falls into two categories:

### A. Character-backed starship system (entirely dead)
The bulk of the removed code served a **never-activated** character-backed starship system where a `type:"character"` actor would double as a starship via flags. This includes:

- `patchStarshipCharacterSheet` / `getStarshipCharacterSheetClassId` -- registered a custom sheet class that was **never called** from `module.mjs`
- `buildStarshipRuntime(actor)` -- computed a comprehensive runtime object (hull/shield dice pools, power zones with 6 systems [central/comms/engines/shields/sensors/weapons], fuel, workforce, equipment costs, crew summary). This was **only called from the dead sheet**.
- `buildStarshipSkillEntries(subject)` -- built skill entries for the character-backed sheet UI. The **active** vehicle path has its own `getStarshipSkillEntries()` in `starship-data.mjs`.
- `buildStarshipItemGroups(actor)` -- grouped items for the character sheet layout. The **active** vehicle path has `categorizeStarshipItems()` in `starship-sheet.mjs`.
- `normalizeLegacyStarshipActorSource` / `normalizeLegacyStarshipItemSource` -- imported from `starship-data.mjs` by `migration.mjs`, not from `starship-character.mjs`. The exports here were **unused duplicates**.
- Various helpers: `preserveStarshipActorData`, `buildCharacterSystem`, `normalizeSourceField`, `normalizeCreatureTypeField`, etc. -- all internal to the dead sheet.

### B. Constants removed
- `STARSHIP_ITEM_TYPE_MAP` -- used only by dead normalization code
- `POWER_DIE_TYPES` -- used only by `buildStarshipRuntime`
- `SS_BASE_UPGRADE_COST` -- used only by `buildStarshipRuntime`; `starship-data.mjs` has its own copy used at pack normalization time
- `STARSHIP_POWER_ZONES` (6-zone version: central/comms/engines/shields/sensors/weapons) -- the dead code used 6 zones matching the full SotG rules; `starship-data.mjs` uses a 4-zone version (central/engines/shields/weapons) for the vehicle sheet

## 2. What the SW5E Starship Rules Cover (SotG)

The Starships of the Galaxy (SotG) rules define these core systems:

| Mechanic | SotG Rule Summary |
|----------|-------------------|
| **Starship Size & Tier** | 6 sizes (Tiny-Gargantuan), 5 tiers of upgrade with increasing Hull/Shield Dice, ability score increases, and size-specific features |
| **Ability Scores** | STR (shields), DEX (maneuvering), CON (hull/durability), INT (sensors), WIS (weapons targeting), CHA (crew coordination) |
| **Hull Points & Hull Dice** | HP analog; Hull Dice for resting/recovery, scale with size and tier |
| **Shield Points & Shield Dice** | Temporary HP analog; regenerate each round based on shield type; 3 shield types with different capacity/regen tradeoffs |
| **Power Dice & Routing** | Reactor type determines power die recovery; Power coupling determines storage (central vs. 5 systems: comms/engines/shields/sensors/weapons); deployment abilities consume power dice |
| **Modifications** | Suite slots and non-suite slots; modifications installed in the ship |
| **Equipment** | Armor (3 types), Shields (3 types), Reactors (3 types), Power Couplings (3 types); cost scales by ship size |
| **Deployments** | 6 roles: Pilot, Gunner, Mechanic, Operator, Coordinator, Technician; each has rank features and actions |
| **Ventures** | Cross-deployment talents characters can take |
| **Starship Skills** | Maneuvering (DEX), Data (INT), Probing (INT), Menace (CHA), Swindling (CHA), Piloting (WIS), etc. |
| **Starship Actions** | Pilot actions (Fly, Evade, Conceal, etc.) and Crew actions (Fire, Boost Shields, Detect, etc.) |
| **Fuel & Travel** | Fuel capacity, cost, consumption; hyperdrive class; travel pace (slow/normal/fast) with stealth implications |
| **System Damage** | Damage to ship systems when hull is depleted |
| **Workforce & Costs** | Upgrade/modification/equipment installation requires workforce and time |

## 3. What the Current Vehicle Sheet SotG Tab Shows

The SotG tab (in `starship-sheet.mjs`) currently displays:

- **Header**: Ship name, image, size badge, crew/passenger count
- **Overview cards** (6 cards): Movement (space speed + turn), Travel Pace, Hyperdrive class, Crew count + pilot name, Fuel (current/max + cost), Power Routing (selected zone + C/E/S/W summary)
- **Sidebar summary**: Tier, Size, Hull Points (current/max), Shield Points (current/max as temp HP), Fuel, Power Routing
- **Starship Skills**: Full skill grid with rollable buttons (uses `getStarshipSkillEntries` from `starship-data.mjs`)
- **Crew Management**: Deploy/undeploy crew, assign pilot, toggle active crew member
- **Item Groups**: Size profile, Starship Actions, Crew Roles (deployments/ventures), Equipment, Modifications, Weapons -- each with open/delete/use/find-in-sheet actions
- **Legacy Notes**: Power routing state, system damage, hyperdrive class, active crew, engine routing effects
- **Weapon rolls**: Applies power routing multiplier to weapon damage

## 4. Specific Gaps: Rules Not Currently in the Vehicle Sheet

### Gap A: Hull Dice / Shield Dice Pools (Display Only)
**Rule**: Ships have Hull Dice (for resting/recovery) and Shield Dice (for shield regeneration). These are tracked as current/max pools.
**Current state**: The SotG tab does **not display** hull/shield dice pools.
**Data availability**: The raw actor-level data (`system.attributes.hull`, `system.attributes.shld`) is **null** in all Drake's Shipyard actors and is not populated by the pack normalization pipeline. However, all the data needed to derive these values exists on the **embedded size item** (`starshipsize` item in `actor.items`):
- `sizeItem.system.hullDice` / `shldDice` -- the die type (d4/d6/d8/d10/d12/d20, scales with ship size)
- `sizeItem.system.hullDiceStart` / `shldDiceStart` -- base dice count at tier 0
- `sizeItem.system.hullDiceUsed` / `shldDiceUsed` -- dice currently expended
- `sizeItem.system.tier` -- ship tier (0-5)

Per SotG rules, ships gain 2 additional Hull Dice and 2 additional Shield Dice per tier. So:
- `diceMax = hullDiceStart + (2 * tier)`
- `diceCurrent = diceMax - hullDiceUsed`

The removed `buildStarshipRuntime` code used exactly this formula. No migration is needed -- the values are fully derivable at runtime from the size item. A new `deriveHullShieldDice(actor)` helper should scan `actor.items` for the size item (using the existing `getLegacyStarshipSize()` and `getLegacySizeSystem()` helpers in `starship-data.mjs`) and compute the pools.
**Recommendation**: **(b) Should be added soon.** Derive at runtime from the size item; no stored values to read or migrate. Add a display card or sidebar entry showing hull dice (e.g., "3/5 d6") and shield dice (e.g., "2/5 d6").

### Gap B: Shield Regeneration Rate
**Rule**: Shields regenerate each round by expending a shield die. The rate depends on shield type (directional x1, fortress x2/3, quick-charge x3/2).
**Current state**: Not computed or displayed. Shield points show as temp HP but regeneration mechanics are not surfaced.
**Removed code**: Not explicitly computed in `buildStarshipRuntime` either -- this was a gap even in the old code.
**Recommendation**: **(c) Future work.** Would require identifying shield equipment type and computing the rate. Nice to have but not critical for the current sheet.

### Gap C: Power Dice Pool (Current/Max per Zone)
**Rule**: Ships store power dice in central and/or system capacitors. Power coupling type determines storage architecture (direct: 4 central; distributed: 2 per system; hub & spoke: 2 central + 1 per system).
**Current state**: The SotG tab shows power routing selection and a 4-zone summary (C/E/S/W values), which covers the *current* dice in each zone. However, it does **not show max capacity** per zone, the power die type, or power dice recovery rate.
**Data availability**: The raw actor data stores per-zone `value` (current dice count) in `system.attributes.power.{central,engines,shields,weapons}.value` and `power.routing`. It does **not** store `max` per zone, `die` type, or recovery rate. These must be derived:
- **Power die type**: Determined by tier. Tier 1=d4, 2=d6, 3=d8, 4=d10, 5=d12 (tier 0 ships have no power dice). Tier is on the embedded size item (`sizeItem.system.tier`).
- **Max capacity per zone**: Determined by the power coupling equipment item on the actor. The coupling item's `system.attributes.cscap` (central storage capacity) and `system.attributes.sscap` (system storage capacity) fields define the architecture:
  - Direct: cscap=4, sscap=0 (4 central, 0 per system)
  - Distributed: cscap=0, sscap=2 (0 central, 2 per system)
  - Hub & Spoke: cscap=2, sscap=1 (2 central, 1 per system)
- **Recovery rate**: Determined by reactor equipment item. The reactor's `system.attributes.powerdicerec.value` field stores the formula (Fuel Cell="1", Ionization="(1d2)-1", Power Core="1d2").

The removed `buildStarshipRuntime` code computed these from equipment items. No migration is needed -- derive at runtime by scanning `actor.items` for equipment with `system.type.value === "powerc"` (coupling) and `system.type.value === "reactor"`.
**Recommendation**: **(b) Should be added soon.** Derive max capacity and die type at runtime from equipment + size items. Show power die type and per-zone current/max alongside current values. The 4-zone vs 6-zone discrepancy is minor -- the vehicle data only stores 4 zones (C/E/S/W), so display those 4.

### Gap D: Modification Slots / Suite Tracking
**Rule**: Each ship size has a base number of modification slots and maximum suites. Modifications consume slots.
**Current state**: The SotG tab lists modifications as items but does **not** show slot usage (e.g., "12/30 slots used, 2/3 suites").
**Data availability**: The raw actor data does **not** store `mods` at the actor level (it is null in all Drake's Shipyard actors). The values are fully derivable from the embedded size item and the modification items on the actor:
- **Max slots**: `sizeItem.system.modBaseCap` (e.g., Small=20, Medium=30, Large=50, Huge=60, Gargantuan=70)
- **Max suites**: `sizeItem.system.modMaxSuitesBase + (sizeItem.system.modMaxSuitesMult * constitutionMod)` (minimum 0)
- **Slots used**: Count of `starshipmod` items on the actor, each consuming slots per their `system.modify.modSlots` value
- **Suites used**: Count of suite-type modifications (identifiable by their modification category)

The removed `buildStarshipRuntime` code computed `mods.slots.value` and `mods.suites.value` vs max from these same sources. No migration is needed -- derive at runtime.
**Recommendation**: **(b) Should be added soon.** Derive slot/suite budget at runtime from size item + modification items. Show slots used vs. max, suites used vs. max.

### Gap E: Upgrade Cost / Workforce Summary
**Rule**: Upgrading tier costs credits scaled by ship size. Equipment installation requires workforce and time.
**Current state**: Not displayed.
**Removed code**: `buildStarshipRuntime` computed `cost.baseBuild`, `cost.baseUpgrade`, `cost.multEquip`, `workforce` values.
**Recommendation**: **(c) Future work / out of scope.** This is bookkeeping data useful during downtime/ship-building, not during gameplay. Could be added later as an optional detail panel.

### Gap F: Active Crew Deployment Actions
**Rule**: Each deployed crew member has deployment rank features that grant specific actions (e.g., a Rank 2 Pilot gets "Snap Roll", a Gunner gets combat gambits). The active crew member's deployment items determine what special actions are available on the ship's turn.
**Current state**: The SotG tab shows crew roster with roles and active status, and shows deployment/venture items on the ship. However, it does **not** resolve which deployment features belong to which crew member, and does not surface "these are the actions the active crew member can take based on their deployment rank."
**Removed code**: `buildResolvedCrewActions` scanned the active crew member's items for deployment feats and presented them as available actions. **This was part of the dead character-backed sheet code.**
**Recommendation**: **(c) Future work.** This is the most complex gap. It requires resolving the active crew member's actor, scanning their items for deployment features, and presenting those as rollable actions in the starship sheet context. While genuinely useful, it crosses a complexity threshold -- it needs to reach into another actor's items and present them on the vehicle sheet. This is a feature worth designing carefully rather than rushing.

### Gap G: System Damage Detail
**Rule**: When hull points reach 0, ships take system damage to specific systems.
**Current state**: System damage is shown as a number in legacy notes (`System Damage: X`) but there is no breakdown of which systems are damaged.
**Removed code**: Only stored a single numeric value, same as current.
**Recommendation**: **(a) Already handled adequately.** The single-number display matches what the data stores.

### Gap H: Saving Throws
**Rule**: Ships are proficient in specific saving throws based on size (e.g., Medium: choice of two; Large: Wisdom + choice of STR/CON).
**Current state**: The vehicle sheet's native dnd5e saving throw section handles this via the standard ability score system. The SotG tab does not duplicate it.
**Recommendation**: **(a) Already handled elsewhere.** The stock vehicle sheet displays saving throws. No need to duplicate in the SotG tab.

## 5. Should We Port `buildResolvedCrewActions`?

**Not yet.** Here is the reasoning:

1. **The function was part of dead code** -- it was only called from the never-registered character-backed sheet. It has never been tested in production.

2. **It crosses actor boundaries** -- it needs to resolve the active crew member's actor document, enumerate their items, filter for deployment features, and present those as rollable actions on the starship sheet. This is architecturally complex and has edge cases (what if the crew actor is not loaded? what if they have features from multiple deployments?).

3. **The current sheet already shows deployment items on the ship** -- the "Crew Roles" group in the SotG tab lists deployment and venture items that are on the starship actor itself. These can be opened and used.

4. **The real value is in a future "crew station" feature** -- rather than porting the old function as-is, a better design would be a dedicated crew station panel that shows, for the active crew member: their deployment rank, their available actions (both standard starship actions and deployment features), and a quick-roll interface. This deserves its own design pass.

**Recommendation**: Track this as a future feature ("Crew Station: show active crew member's deployment actions on the starship sheet"). Do not port the old `buildResolvedCrewActions` directly.

## 6. Data Availability and Migration Analysis

Analysis date: 2026-04-04

### Key Finding: No Migration Needed

All three "Soon" gaps (A, C, D) involve data that is **not stored** at the actor level in raw source data or in the `legacyStarshipActor` flags. Instead, the values are **fully derivable at runtime** from items embedded on the actor. No migration is required.

### Data Sources for Derivation

| Field | Source | Location on Actor |
|-------|--------|-------------------|
| Hull die type | Size item | `sizeItem.system.hullDice` (d4/d6/d8/d10/d12/d20) |
| Hull dice max | Size item | `sizeItem.system.hullDiceStart + (2 * sizeItem.system.tier)` |
| Hull dice current | Size item | `hullDiceMax - sizeItem.system.hullDiceUsed` |
| Shield die type | Size item | `sizeItem.system.shldDice` |
| Shield dice max | Size item | `sizeItem.system.shldDiceStart + (2 * sizeItem.system.tier)` |
| Shield dice current | Size item | `shieldDiceMax - sizeItem.system.shldDiceUsed` |
| Power die type | Size item (tier) | Tier 1=d4, 2=d6, 3=d8, 4=d10, 5=d12 (tier 0 = no power dice) |
| Power zone max (central) | Power coupling equipment | `couplingItem.system.attributes.cscap.value` |
| Power zone max (per system) | Power coupling equipment | `couplingItem.system.attributes.sscap.value` |
| Power dice recovery | Reactor equipment | `reactorItem.system.attributes.powerdicerec.value` |
| Mod slots max | Size item | `sizeItem.system.modBaseCap` |
| Mod suites max | Size item + CON | `sizeItem.system.modMaxSuitesBase + (sizeItem.system.modMaxSuitesMult * conMod)` (min 0) |
| Mod slots used | Modification items | Count/sum of `starshipmod` items on actor |

### Why Stored Values Don't Exist

The pack source files in `packs/_source/drakes-shipyard/` store actors with `type: "starship"` -- their raw `system.attributes` has **null** for `hull`, `shld`, and `mods`. Only `power.{zone}.value` (current dice per zone) and `power.routing` are stored at the actor level.

The normalization pipeline (`normalizeLegacyStarshipActorData` in `starship-data.mjs`) converts these to `type: "vehicle"` and builds the `legacyStarshipActor` flag, but `buildVehicleSystem` uses `mergeStarshipSystemData` which only preserves keys that already exist in the input. Since hull/shld/mods are null in the source, they remain absent in the normalized output.

The old `buildStarshipRuntime` (removed dead code from `starship-character.mjs`) computed these values at runtime from the size and equipment items -- it never relied on stored actor-level values either.

### Implications for World Actors

- **Compendium actors** (Drake's Shipyard): Always have the embedded size item with correct tier, hull/shield dice fields, and equipment items. Derivation will work.
- **World actors imported from compendium**: Same as above -- items are copied when the actor is imported.
- **Manually created world actors**: Would need a size item added manually. Without one, derivation returns null/defaults. This is acceptable -- a starship without a size item is incomplete by definition.
- **Pre-existing world actors from older module versions**: May have different flag structures, but the derivation approach is resilient -- it only reads item data, not flag fields. As long as the size item exists, it works.

### Runtime Migration (`migration.mjs`)

The runtime migration does **not** need to be extended for these fields. There is nothing to migrate because:
1. The values were never stored at the actor level in the source data
2. The derivation approach reads from items, which are always present on properly-constructed actors
3. The normalization pipeline already handles converting `type: "starship"` to `type: "vehicle"` and normalizing item types

### Recommended Implementation Approach

**Derive at runtime, don't store.** Add a new export to `starship-data.mjs` (e.g., `deriveStarshipPools(actor)`) that:
1. Finds the size item via existing `getLegacyStarshipSize()` / `getLegacySizeSystem()` helpers
2. Finds equipment items by `system.type.value` (`"powerc"`, `"reactor"`)
3. Computes hull/shield dice pools, power die info, and mod slot budget
4. Returns a structured object for the sheet template to consume

This mirrors the pattern already used by `getDerivedStarshipRuntime()` for movement/travel/crew data.

## Summary of Recommendations

| Gap | Priority | Action |
|-----|----------|--------|
| A. Hull/Shield Dice pools | **Soon** | Derive from size item at runtime; display in SotG tab |
| B. Shield Regeneration Rate | Future | Requires shield type identification; defer |
| C. Power Dice max capacity | **Soon** | Derive from equipment items at runtime; show die type + per-zone max |
| D. Modification slot budget | **Soon** | Derive from size item + mod items at runtime; show slots/suites used vs. max |
| E. Upgrade cost/workforce | Future | Bookkeeping data, not gameplay-critical |
| F. Active crew deployment actions | Future | Design as "Crew Station" feature; do not port old code directly |
| G. System damage detail | Done | Already adequate |
| H. Saving throws | Done | Handled by stock vehicle sheet |
