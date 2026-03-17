# Starship Architecture Comparison

This document compares two possible foundations for SW5E starships in `sw5e-module`:

- keep the current `vehicle`-based model and patch in the missing starship-specific behavior
- redesign starships around `character`-sheet semantics with species/class-style modeling

The goal is to choose the safer long-term direction without losing sight of migration cost, current feature coverage, or dnd5e compatibility.

## Current Baseline

The module is already strongly committed to a vehicle-first architecture.

- [`scripts/starship-data.mjs`](../scripts/starship-data.mjs) normalizes legacy starships into `type: "vehicle"` actors.
- [`scripts/patch/starship-sheet.mjs`](../scripts/patch/starship-sheet.mjs) builds the current Bridge, Systems, Crew, and Weapons tabs around vehicle-shaped actor data.
- [`scripts/patch/starship-prepare.mjs`](../scripts/patch/starship-prepare.mjs) patches vehicle prep for routing, shield mirroring, and legacy starship roll data.
- [`scripts/patch/starship-routing-mechanics.mjs`](../scripts/patch/starship-routing-mechanics.mjs) scopes routing mechanics to converted starships that are still vehicle actors.
- [`scripts/migration.mjs`](../scripts/migration.mjs) already migrates and preserves starship data with the assumption that converted starships land as vehicles.

Representative example from the current conversion path:

```javascript
// scripts/starship-data.mjs
data.type = "vehicle";
data.system = buildVehicleSystem(legacySystem, data.items ?? [], currentSystem);
```

That means the current question is not "what is theoretically elegant?", but "what delivers the best result for this module without forcing a second architecture migration too early?"

## What Vehicle-First Already Gives You

Using dnd5e's native vehicle model provides several starship-relevant behaviors out of the box.

From dnd5e's `VehicleData` schema in the installed system:

```javascript
// dnd5e.mjs
crew: new SchemaField({
  max: new NumberField({ min: 0, integer: true }),
  value: new ArrayField(new DocumentUUIDField({ type: "Actor" }))
}),
passengers: new SchemaField({
  max: new NumberField({ min: 0, integer: true }),
  value: new ArrayField(new DocumentUUIDField({ type: "Actor" }))
}),
cargo: new SchemaField({
  crew: new ArrayField(makePassengerData()),
  passengers: new ArrayField(makePassengerData())
})
```

That lines up well with your current starship feature set:

- crew capacity, passenger capacity, and cargo already map cleanly into a vehicle model
- native vehicle movement and action economy are already present
- users naturally expect dropping actors onto a ship to interact with a vehicle-style sheet
- the current custom starship tabs already use vehicle-backed crew, passengers, cargo, and item organization
- shields already work as a vehicle-compatible temporary HP mirror
- routing mechanics already patch the current vehicle prep and damage pipeline

Current module examples:

- [`scripts/starship-data.mjs`](../scripts/starship-data.mjs) builds vehicle movement, hull, cargo, and shield fields
- [`scripts/patch/starship-sheet.mjs`](../scripts/patch/starship-sheet.mjs) renders Crew tab data from `crew`, `passengers`, deployment state, and role items
- [`scripts/patch/starship-routing-mechanics.mjs`](../scripts/patch/starship-routing-mechanics.mjs) assumes converted starships remain vehicle actors

### Vehicle-First Strengths

1. Lowest migration risk because it preserves the shape the module already writes and reads.
2. Best fit for crew/passenger/cargo transport semantics.
3. Preserves the current starship tabs and custom workflows with incremental patching instead of replacement.
4. Keeps compatibility with the vehicle mental model users already have in dnd5e.
5. Lets the module keep benefiting from vehicle-side dnd5e improvements without re-implementing them.

### Vehicle-First Weaknesses

1. Vehicles do not inherit the `CreatureTemplate` character skill model.
2. Character-style progression metaphors like class/species/tier do not fit natively.
3. Some starship concepts look closer to "character with systems" than "vehicle with cargo", especially if you want a full skills page and advancement-heavy presentation.
4. More sheet patching is needed to make the experience feel as rich as a character sheet.

## What Character-Rebase Would Give You

Using dnd5e's `CharacterData` model would align more naturally with several SW5E starship concepts.

From dnd5e's `CharacterData` model:

```javascript
// dnd5e.mjs
class CharacterData extends CreatureTemplate {
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    supportsAdvancement: true
  }, { inplace: false }));
}
```

Because characters derive from `CreatureTemplate`, they come with creature-style data and sheet expectations that are not present on vehicles:

- native skills support
- character-style advancement support
- tighter fit for species/class-style metaphors
- more direct access to PC-oriented UI patterns in dnd5e

This is the strongest argument in favor of the alternative your dev team suggested.

### Character-Rebase Strengths

1. Native skills are a much more natural fit.
2. Species plus classification/class semantics are easier to explain in character-sheet terms.
3. Advancement-heavy starship modeling would sit on a more familiar dnd5e foundation.
4. Some UI parity with player sheets would be easier to achieve.

### Character-Rebase Weaknesses

1. Crew, passengers, and cargo are not native character concepts and would have to be rebuilt.
2. Vehicle-style transport workflows would no longer come "for free".
3. The current starship migration output would need a new target model.
4. The current custom starship tabs, routing prep, shield sync, and damage hooks all assume starships are vehicles.
5. Existing starship items and categories would need another pass to decide which become species, class, pseudo-class, feats, or custom embedded state.
6. Deployments and ventures become more conceptually awkward if they are treated as a second class system layered onto a starship character.

## What Character-Rebase Would Force You To Rebuild

If you switch to a character-style foundation, these areas are no longer incremental patches. They become architecture rewrite work.

### 1. Actor Conversion And Migration

Current code migrates starships into vehicles:

- [`scripts/starship-data.mjs`](../scripts/starship-data.mjs)
- [`scripts/migration.mjs`](../scripts/migration.mjs)

A character rebase would require:

- a new normalized character target schema
- new migration rules for all existing world starships
- compatibility handling for already-converted vehicle starships
- likely new compendium rebuild rules for starship entries

### 2. Crew And Transport Semantics

Current crew/passenger behavior is deeply vehicle-oriented:

- [`scripts/starship-data.mjs`](../scripts/starship-data.mjs)
- [`scripts/patch/starship-sheet.mjs`](../scripts/patch/starship-sheet.mjs)

A character rebase would need custom equivalents for:

- crew capacity
- passenger capacity
- cargo handling
- assignment views
- actor-drop expectations and any downstream module compatibility based on vehicles

### 3. Shields And Routing

Current shield routing is wired to vehicle HP and converted starship detection:

- [`scripts/patch/starship-prepare.mjs`](../scripts/patch/starship-prepare.mjs)
- [`scripts/patch/starship-routing-mechanics.mjs`](../scripts/patch/starship-routing-mechanics.mjs)
- [`scripts/starship-routing.mjs`](../scripts/starship-routing.mjs)

That means a character rebase must rework:

- shield mirroring
- routing movement changes
- routing damage application
- any vehicle-only assumptions in the current prep hooks

### 4. Sheet Architecture

The current sheet layer is already organized around a vehicle-backed custom UI:

- Bridge
- Systems
- Crew
- Weapons

Those tabs could be visually preserved, but the underlying data preparation would need partial or full replacement.

## Side-By-Side Comparison

| Category | Vehicle-First | Character-Rebase |
| --- | --- | --- |
| Skills support | Weak natively, patch required | Strong natively |
| Crew/passengers/cargo | Strong natively | Weak, rebuild required |
| Movement and transport semantics | Strong natively | Custom rebuild likely |
| Shield compatibility with current code | Strong | Rewrite required |
| Routing compatibility with current code | Strong | Rewrite required |
| Migration risk | Low to moderate | High |
| Existing world compatibility | Strong | Risky |
| Existing compendium compatibility | Strong | Risky |
| Reuse of current custom tabs | Strong | Medium at best |
| Long-term dnd5e alignment | Good for ship-as-vehicle | Good for ship-as-character |
| Time to next usable milestone | Fastest | Slowest |

## Practical Scoring

Higher is better.

| Criterion | Vehicle-First | Character-Rebase |
| --- | --- | --- |
| Compatibility with current repo | 5/5 | 1/5 |
| Migration safety | 5/5 | 1/5 |
| Native support for crew/cargo workflows | 5/5 | 1/5 |
| Native support for starship skills | 2/5 | 5/5 |
| Amount of new patching required | 3/5 | 1/5 |
| Near-term maintainability | 4/5 | 2/5 |
| Long-term conceptual elegance | 3/5 | 4/5 |

## Recommendation

The recommended path is:

1. Keep the **vehicle-first** foundation now.
2. Add the missing **character-like affordances** on top of the custom starship sheet.
3. Treat any character-style rebase as a future major-version project only if vehicle patching proves insufficient.

### Why

- The module already has working migration, shields, routing, Crew/Systems/Weapons tabs, and item categorization built around vehicles.
- Crew/passenger/cargo behavior is not a side detail. It is core starship functionality, and vehicles already provide the right base semantics.
- The largest pain point raised by your dev team is **skills**, not a total failure of the vehicle model.
- Rebuilding around characters would trade one hard problem for several harder ones.

In other words: the current architecture looks like it is missing a few important "character-like" layers, not that it picked the wrong base actor type entirely.

## Best Hybrid Interpretation

The best long-term compromise is not "vehicle or character". It is:

- **vehicle actor**
- **custom starship sheet**
- **character-style presentation where useful**

That means:

- preserve vehicle transport semantics
- preserve current migration target
- patch in starship skills and tier/classification display
- keep size/classification modeling in starship items or item-driven metadata instead of forcing a full actor-type rewrite

## Recommended Next Implementation Track

If you accept the recommendation, the next plan should be:

1. Audit how to expose a dedicated starship skill model on vehicle-backed starships.
2. Decide whether starship size/classification should remain item-driven or become a more explicit derived field.
3. Patch the custom starship sheet to render starship skills in a character-like way without abandoning the vehicle actor.
4. Keep shields, routing, crew, cargo, and deployments on the current vehicle-first path.

## Final Verdict

For `dnd5e` `5.2.5` and the current state of `sw5e-module`, **vehicle-first is the better engineering choice**.

A full character rebase may become worth revisiting later if:

- dnd5e's native tier support matures in a way that clearly benefits starships
- the module reaches a deliberate breaking-change migration window
- vehicle-based skill support proves too fragile in practice

Until then, the lowest-risk, highest-value path is to keep starships as vehicles and selectively add the character-sheet strengths you actually need.
# Starship Architecture Comparison

This document compares two possible foundations for SW5E starships in `sw5e-module`:

- keep the current `vehicle`-based model and patch in the missing starship-specific behavior
- redesign starships around `character`-sheet semantics with species/class-style modeling

The goal is to choose the safer long-term direction without losing sight of migration cost, current feature coverage, or dnd5e compatibility.

## Current Baseline

The module is already strongly committed to a vehicle-first architecture.

- [`scripts/starship-data.mjs`](../scripts/starship-data.mjs) normalizes legacy starships into `type: "vehicle"` actors.
- [`scripts/patch/starship-sheet.mjs`](../scripts/patch/starship-sheet.mjs) builds the current Bridge, Systems, Crew, and Weapons tabs around vehicle-shaped actor data.
- [`scripts/patch/starship-prepare.mjs`](../scripts/patch/starship-prepare.mjs) patches vehicle prep for routing, shield mirroring, and legacy starship roll data.
- [`scripts/patch/starship-routing-mechanics.mjs`](../scripts/patch/starship-routing-mechanics.mjs) scopes routing mechanics to converted starships that are still vehicle actors.
- [`scripts/migration.mjs`](../scripts/migration.mjs) already migrates and preserves starship data with the assumption that converted starships land as vehicles.

Representative example from the current conversion path:

```javascript
// scripts/starship-data.mjs
data.type = "vehicle";
data.system = buildVehicleSystem(legacySystem, data.items ?? [], currentSystem);
```

That means the current question is not "what is theoretically elegant?", but "what delivers the best result for this module without forcing a second architecture migration too early?"

## What Vehicle-First Already Gives You

Using dnd5e's native vehicle model provides several starship-relevant behaviors out of the box.

From dnd5e's `VehicleData` schema in the installed system:

```javascript
// dnd5e.mjs
crew: new SchemaField({
  max: new NumberField({ min: 0, integer: true }),
  value: new ArrayField(new DocumentUUIDField({ type: "Actor" }))
}),
passengers: new SchemaField({
  max: new NumberField({ min: 0, integer: true }),
  value: new ArrayField(new DocumentUUIDField({ type: "Actor" }))
}),
cargo: new SchemaField({
  crew: new ArrayField(makePassengerData()),
  passengers: new ArrayField(makePassengerData())
})
```

That lines up well with your current starship feature set:

- crew capacity, passenger capacity, and cargo already map cleanly into a vehicle model
- native vehicle movement and action economy are already present
- users naturally expect dropping actors onto a ship to interact with a vehicle-style sheet
- the current custom starship tabs already use vehicle-backed crew, passengers, cargo, and item organization
- shields already work as a vehicle-compatible temporary HP mirror
- routing mechanics already patch the current vehicle prep and damage pipeline

Current module examples:

- [`scripts/starship-data.mjs`](../scripts/starship-data.mjs) builds vehicle movement, hull, cargo, and shield fields
- [`scripts/patch/starship-sheet.mjs`](../scripts/patch/starship-sheet.mjs) renders Crew tab data from `crew`, `passengers`, deployment state, and role items
- [`scripts/patch/starship-routing-mechanics.mjs`](../scripts/patch/starship-routing-mechanics.mjs) assumes converted starships remain vehicle actors

### Vehicle-First Strengths

1. Lowest migration risk because it preserves the shape the module already writes and reads.
2. Best fit for crew/passenger/cargo transport semantics.
3. Preserves the current starship tabs and custom workflows with incremental patching instead of replacement.
4. Keeps compatibility with the vehicle mental model users already have in dnd5e.
5. Lets the module keep benefiting from vehicle-side dnd5e improvements without re-implementing them.

### Vehicle-First Weaknesses

1. Vehicles do not inherit the `CreatureTemplate` character skill model.
2. Character-style progression metaphors like class/species/tier do not fit natively.
3. Some starship concepts look closer to "character with systems" than "vehicle with cargo", especially if you want a full skills page and advancement-heavy presentation.
4. More sheet patching is needed to make the experience feel as rich as a character sheet.

## What Character-Rebase Would Give You

Using dnd5e's `CharacterData` model would align more naturally with several SW5E starship concepts.

From dnd5e's `CharacterData` model:

```javascript
// dnd5e.mjs
class CharacterData extends CreatureTemplate {
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    supportsAdvancement: true
  }, { inplace: false }));
}
```

Because characters derive from `CreatureTemplate`, they come with creature-style data and sheet expectations that are not present on vehicles:

- native skills support
- character-style advancement support
- tighter fit for species/class-style metaphors
- more direct access to PC-oriented UI patterns in dnd5e

This is the strongest argument in favor of the alternative your dev team suggested.

### Character-Rebase Strengths

1. Native skills are a much more natural fit.
2. Species plus classification/class semantics are easier to explain in character-sheet terms.
3. Advancement-heavy starship modeling would sit on a more familiar dnd5e foundation.
4. Some UI parity with player sheets would be easier to achieve.

### Character-Rebase Weaknesses

1. Crew, passengers, and cargo are not native character concepts and would have to be rebuilt.
2. Vehicle-style transport workflows would no longer come "for free".
3. The current starship migration output would need a new target model.
4. The current custom starship tabs, routing prep, shield sync, and damage hooks all assume starships are vehicles.
5. Existing starship items and categories would need another pass to decide which become species, class, pseudo-class, feats, or custom embedded state.
6. Deployments and ventures become more conceptually awkward if they are treated as a second class system layered onto a starship character.

## What Character-Rebase Would Force You To Rebuild

If you switch to a character-style foundation, these areas are no longer incremental patches. They become architecture rewrite work.

### 1. Actor Conversion And Migration

Current code migrates starships into vehicles:

- [`scripts/starship-data.mjs`](../scripts/starship-data.mjs)
- [`scripts/migration.mjs`](../scripts/migration.mjs)

A character rebase would require:

- a new normalized character target schema
- new migration rules for all existing world starships
- compatibility handling for already-converted vehicle starships
- likely new compendium rebuild rules for starship entries

### 2. Crew And Transport Semantics

Current crew/passenger behavior is deeply vehicle-oriented:

- [`scripts/starship-data.mjs`](../scripts/starship-data.mjs)
- [`scripts/patch/starship-sheet.mjs`](../scripts/patch/starship-sheet.mjs)

A character rebase would need custom equivalents for:

- crew capacity
- passenger capacity
- cargo handling
- assignment views
- actor-drop expectations and any downstream module compatibility based on vehicles

### 3. Shields And Routing

Current shield routing is wired to vehicle HP and converted starship detection:

- [`scripts/patch/starship-prepare.mjs`](../scripts/patch/starship-prepare.mjs)
- [`scripts/patch/starship-routing-mechanics.mjs`](../scripts/patch/starship-routing-mechanics.mjs)
- [`scripts/starship-routing.mjs`](../scripts/starship-routing.mjs)

That means a character rebase must rework:

- shield mirroring
- routing movement changes
- routing damage application
- any vehicle-only assumptions in the current prep hooks

### 4. Sheet Architecture

The current sheet layer is already organized around a vehicle-backed custom UI:

- Bridge
- Systems
- Crew
- Weapons

Those tabs could be visually preserved, but the underlying data preparation would need partial or full replacement.

## Side-By-Side Comparison

| Category | Vehicle-First | Character-Rebase |
| --- | --- | --- |
| Skills support | Weak natively, patch required | Strong natively |
| Crew/passengers/cargo | Strong natively | Weak, rebuild required |
| Movement and transport semantics | Strong natively | Custom rebuild likely |
| Shield compatibility with current code | Strong | Rewrite required |
| Routing compatibility with current code | Strong | Rewrite required |
| Migration risk | Low to moderate | High |
| Existing world compatibility | Strong | Risky |
| Existing compendium compatibility | Strong | Risky |
| Reuse of current custom tabs | Strong | Medium at best |
| Long-term dnd5e alignment | Good for ship-as-vehicle | Good for ship-as-character |
| Time to next usable milestone | Fastest | Slowest |

## Practical Scoring

Higher is better.

| Criterion | Vehicle-First | Character-Rebase |
| --- | --- | --- |
| Compatibility with current repo | 5/5 | 1/5 |
| Migration safety | 5/5 | 1/5 |
| Native support for crew/cargo workflows | 5/5 | 1/5 |
| Native support for starship skills | 2/5 | 5/5 |
| Amount of new patching required | 3/5 | 1/5 |
| Near-term maintainability | 4/5 | 2/5 |
| Long-term conceptual elegance | 3/5 | 4/5 |

## Recommendation

The recommended path is:

1. Keep the **vehicle-first** foundation now.
2. Add the missing **character-like affordances** on top of the custom starship sheet.
3. Treat any character-style rebase as a future major-version project only if vehicle patching proves insufficient.

### Why

- The module already has working migration, shields, routing, Crew/Systems/Weapons tabs, and item categorization built around vehicles.
- Crew/passenger/cargo behavior is not a side detail. It is core starship functionality, and vehicles already provide the right base semantics.
- The largest pain point raised by your dev team is **skills**, not a total failure of the vehicle model.
- Rebuilding around characters would trade one hard problem for several harder ones.

In other words: the current architecture looks like it is missing a few important "character-like" layers, not that it picked the wrong base actor type entirely.

## Best Hybrid Interpretation

The best long-term compromise is not "vehicle or character". It is:

- **vehicle actor**
- **custom starship sheet**
- **character-style presentation where useful**

That means:

- preserve vehicle transport semantics
- preserve current migration target
- patch in starship skills and tier/classification display
- keep size/classification modeling in starship items or item-driven metadata instead of forcing a full actor-type rewrite

## Recommended Next Implementation Track

If you accept the recommendation, the next plan should be:

1. Audit how to expose a dedicated starship skill model on vehicle-backed starships.
2. Decide whether starship size/classification should remain item-driven or become a more explicit derived field.
3. Patch the custom starship sheet to render starship skills in a character-like way without abandoning the vehicle actor.
4. Keep shields, routing, crew, cargo, and deployments on the current vehicle-first path.

## Final Verdict

For `dnd5e` `5.2.5` and the current state of `sw5e-module`, **vehicle-first is the better engineering choice**.

A full character rebase may become worth revisiting later if:

- dnd5e's native tier support matures in a way that clearly benefits starships
- the module reaches a deliberate breaking-change migration window
- vehicle-based skill support proves too fragile in practice

Until then, the lowest-risk, highest-value path is to keep starships as vehicles and selectively add the character-sheet strengths you actually need.
