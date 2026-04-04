# Future: 6 Named Deployment Roles

## Background

SW5E defines 6 named deployment roles: **Pilot, Gunner, Operator, Coordinator, Mechanic, Technician**. The current crew assignment system uses a simplified 3-role model: `pilot` (singleton), `crew` (generic set), `passenger` (set). The 6 named roles exist as feat-type deployment items that PCs level up in, but are not enforced at the starship level.

This document describes the future expansion to expose all 6 roles in the crew assignment UI.

## What Would Change

### Data model

The deployment data stored in `flags.sw5e.legacyStarshipActor.system.attributes.deployment` would expand from 3 slots to 8:

**Current:**
```json
{
  "pilot": { "value": "uuid", "active": false },
  "crew": { "items": ["uuid1", "uuid2"], "active": false },
  "passenger": { "items": ["uuid3"], "active": false },
  "active": { "value": null }
}
```

**Future:**
```json
{
  "pilot": { "value": "uuid", "active": false },
  "gunner": { "items": ["uuid1"], "active": false },
  "operator": { "items": [], "active": false },
  "coordinator": { "items": [], "active": false },
  "mechanic": { "items": [], "active": false },
  "technician": { "items": [], "active": false },
  "passenger": { "items": ["uuid3"], "active": false },
  "active": { "value": null }
}
```

`STARSHIP_DEPLOYMENT_ROLES` expands from `["pilot", "crew", "passenger"]` to `["pilot", "gunner", "operator", "coordinator", "mechanic", "technician", "passenger"]`.

### Migration

Existing world actors that have members in `crew.items` would need to be migrated — either:
- Moved to a default catch-all role (e.g., "mechanic" as the generic crew role), or
- Left unassigned and re-assigned by the GM

A migration step in `migration.mjs` would handle this.

### Code changes

All functions that iterate over the deployment structure would need updating:
- `getDeploymentState` — construct all 8 keys
- `collectDeploymentUuids` — iterate all role sets
- `getDeploymentRolesForUuid` — check all 6 active roles
- `buildDeploymentUpdateData` — write all 8 keys
- `syncDeploymentActiveFlags` — sync active flags for all roles
- `buildResolvedCrewRecord` — `isCrew` becomes `isGunner`, `isOperator`, etc.
- `STARSHIP_DEPLOYMENT_ROLES` constant updated

### UI changes

The crew roster partial would show role-grouped sections rather than a flat list — e.g., an accordion or labeled subsections per role. Deploy buttons would include all 6 role options (or a dropdown).

### Auto-detection opportunity

When a character has a Gunner deployment feat, the UI could default the role assignment to "gunner," reducing manual work for the GM.

## Scope Estimate

Medium-sized feature. Requires:
- Data model change + migration step
- Updates to 6+ functions in `starship-character.mjs`
- Template changes for role-grouped crew roster
- CSS for new role sections

No changes to how deployment feat items work on the PC actor side — those already correctly represent the 6 named roles via `system.type.subtype`.
