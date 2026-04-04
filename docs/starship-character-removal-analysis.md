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
**Current state**: The legacy flag data stores `hull.die`, `hull.dice`, `hull.dicemax`, `shld.die`, `shld.dice`, `shld.dicemax` -- this data exists in the flags from the pack normalization pipeline. But the SotG tab **does not display** these pools.
**Removed code**: `buildStarshipRuntime` computed these pools. The data is still stored; only the UI is missing.
**Recommendation**: **(b) Should be added soon.** This is low-hanging fruit -- the data exists in the legacy system flags. Add a display card or sidebar entry showing hull dice (e.g., "3/5 d6") and shield dice (e.g., "2/5 d6"). No complex logic needed, just read from `legacySystem.attributes.hull` and `legacySystem.attributes.shld`.

### Gap B: Shield Regeneration Rate
**Rule**: Shields regenerate each round by expending a shield die. The rate depends on shield type (directional x1, fortress x2/3, quick-charge x3/2).
**Current state**: Not computed or displayed. Shield points show as temp HP but regeneration mechanics are not surfaced.
**Removed code**: Not explicitly computed in `buildStarshipRuntime` either -- this was a gap even in the old code.
**Recommendation**: **(c) Future work.** Would require identifying shield equipment type and computing the rate. Nice to have but not critical for the current sheet.

### Gap C: Power Dice Pool (Current/Max per Zone)
**Rule**: Ships store power dice in central and/or system capacitors. Power coupling type determines storage architecture (direct: 4 central; distributed: 2 per system; hub & spoke: 2 central + 1 per system).
**Current state**: The SotG tab shows power routing selection and a 4-zone summary (C/E/S/W values), which covers the *current* dice in each zone. However, it does **not show max capacity** per zone, the power die type, or power dice recovery rate.
**Removed code**: `buildStarshipRuntime` computed full power zone state including max capacity per zone. The old code used 6 zones (adding comms and sensors); `starship-data.mjs` uses 4 zones.
**Recommendation**: **(b) Should be added soon.** Show the power die type and max capacity alongside current values. The data is already in `legacySystem.attributes.power`. The 4-zone vs 6-zone discrepancy is minor -- the vehicle data only stores 4 zones, so display those 4 with current/max.

### Gap D: Modification Slots / Suite Tracking
**Rule**: Each ship size has a base number of modification slots and maximum suites. Modifications consume slots.
**Current state**: The SotG tab lists modifications as items but does **not** show slot usage (e.g., "12/30 slots used, 2/3 suites").
**Removed code**: `buildStarshipRuntime` computed `mods.slots.value` and `mods.suites.value` vs max.
**Recommendation**: **(b) Should be added soon.** The modification count is visible, but showing slot budget vs. capacity would be genuinely useful for ship building. The data may be available in `legacySystem.attributes.mods`.

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

## Summary of Recommendations

| Gap | Priority | Action |
|-----|----------|--------|
| A. Hull/Shield Dice pools | **Soon** | Add display card showing current/max hull dice and shield dice from legacy flags |
| B. Shield Regeneration Rate | Future | Requires shield type identification; defer |
| C. Power Dice max capacity | **Soon** | Show power die type and per-zone max alongside current values |
| D. Modification slot budget | **Soon** | Show slots used vs. max, suites used vs. max |
| E. Upgrade cost/workforce | Future | Bookkeeping data, not gameplay-critical |
| F. Active crew deployment actions | Future | Design as "Crew Station" feature; do not port old code directly |
| G. System damage detail | Done | Already adequate |
| H. Saving throws | Done | Handled by stock vehicle sheet |
