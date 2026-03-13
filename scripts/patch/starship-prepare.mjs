import { getModuleId, HOOKS_NAMESPACE } from "../module-support.mjs";
import { mergeVehicleAbilityValues } from "../starship-data.mjs";

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
			if ( actorSource?.flags?.sw5e?.legacyStarshipActor?.type === "starship" ) {
				const legacyAbilities = actorSource.flags.sw5e.legacyStarshipActor.system?.abilities ?? actorSource.system?.abilities;
				const mergedAbilities = mergeVehicleAbilityValues(this.abilities, legacyAbilities);
				if ( mergedAbilities ) {
					this.abilities = mergedAbilities;
					if ( actorSource.system && (typeof actorSource.system === "object") ) {
						actorSource.system.abilities = mergedAbilities;
					}
				}
			}

			return wrapped(...args);
		}, "WRAPPER");
	} catch ( err ) {
		console.warn(`${HOOKS_NAMESPACE.toUpperCase()} | Skipping incompatible starship prepare wrapper target.`, err);
	}
}
