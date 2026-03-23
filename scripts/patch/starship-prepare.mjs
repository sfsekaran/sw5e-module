import { getModuleId, HOOKS_NAMESPACE } from "../module-support.mjs";
import { applyDerivedStarshipMovement, deriveStarshipMovementData, mergeVehicleAbilityValues } from "../starship-data.mjs";

function getActorSource(model) {
	const candidates = [
		model?.parent,
		model?.parent?.document,
		model?.parent?.parent,
		model?.parent?.parent?.document
	];

	for ( const candidate of candidates ) {
		if ( candidate?._source ) return candidate._source;
	}

	return null;
}

export function patchStarshipPrepare() {
	try {
		libWrapper.register(getModuleId(), "dnd5e.dataModels.actor.VehicleData.prototype.prepareAbilities", function(wrapped, ...args) {
			const actorSource = getActorSource(this);
			let legacySystem = null;
			if ( actorSource?.flags?.sw5e?.legacyStarshipActor?.type === "starship" ) {
				legacySystem = actorSource.flags.sw5e.legacyStarshipActor.system ?? {};
				const legacyAbilities = legacySystem.abilities ?? actorSource.system?.abilities;
				const mergedAbilities = mergeVehicleAbilityValues(this.abilities, legacyAbilities);
				if ( mergedAbilities ) {
					this.abilities = mergedAbilities;
					if ( actorSource.system && (typeof actorSource.system === "object") ) {
						actorSource.system.abilities = mergedAbilities;
					}
				}
			}

			const result = wrapped(...args);
			if ( legacySystem ) {
				const movement = deriveStarshipMovementData({
					legacySystem,
					items: actorSource.items ?? [],
					liveAbilities: this.abilities ?? actorSource.system?.abilities ?? {},
					liveMovement: this.attributes?.movement ?? actorSource.system?.attributes?.movement ?? {}
				});
				applyDerivedStarshipMovement(legacySystem, movement);
				if ( this.attributes?.movement && (typeof this.attributes.movement === "object") ) {
					this.attributes.movement.fly = movement.space;
					if ( movement.units ) this.attributes.movement.units = movement.units;
				}
				if ( actorSource.system?.attributes?.movement && (typeof actorSource.system.attributes.movement === "object") ) {
					actorSource.system.attributes.movement.fly = movement.space;
					if ( movement.units ) actorSource.system.attributes.movement.units = movement.units;
				}
			}

			return result;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn(`${HOOKS_NAMESPACE.toUpperCase()} | Skipping incompatible starship prepare wrapper target.`, err);
	}
}
