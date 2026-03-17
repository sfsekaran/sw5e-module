import { getModuleId, HOOKS_NAMESPACE } from "../module-support.mjs";
import { mergeVehicleAbilityValues } from "../starship-data.mjs";
import { getPowerRoutingMultiplier, getShieldState } from "../starship-routing.mjs";

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

function applyStarshipRoutingMovement(model) {
	const actorSource = getActorSource(model);
	if ( actorSource?.flags?.sw5e?.legacyStarshipActor?.type !== "starship" ) return;

	const movement = model?.attributes?.movement;
	if ( !movement || !Number.isFinite(Number(movement.fly)) ) return;

	const multiplier = getPowerRoutingMultiplier(actorSource, "engines");
	const adjustedFly = Math.max(0, Math.floor(Number(movement.fly) * multiplier));
	movement.fly = adjustedFly;
	if ( "speed" in movement ) movement.speed = adjustedFly;
}

function applyStarshipShieldMirror(model) {
	const actorSource = getActorSource(model);
	if ( actorSource?.flags?.sw5e?.legacyStarshipActor?.type !== "starship" ) return;

	const hp = model?.attributes?.hp;
	if ( !hp || (typeof hp !== "object") ) return;

	const shields = getShieldState(actorSource);
	hp.temp = shields.value;
	hp.tempmax = shields.max;

	if ( actorSource.system && (typeof actorSource.system === "object") ) {
		foundry.utils.setProperty(actorSource.system, "attributes.hp.temp", shields.value);
		foundry.utils.setProperty(actorSource.system, "attributes.hp.tempmax", shields.max);
	}
}

function getLegacyStarshipSizeData(actor) {
	const sizeItem = actor?.items?.find(item => item?.flags?.sw5e?.legacyStarshipSize);
	return sizeItem?.flags?.sw5e?.legacyStarshipSize ?? null;
}

function applyStarshipRollData(actor, rollData) {
	if ( actor?.flags?.sw5e?.legacyStarshipActor?.type !== "starship" ) return rollData;

	const sizeData = getLegacyStarshipSizeData(actor);
	if ( !sizeData ) return rollData;

	const shields = getShieldState(actor);
	const hull = actor.system?.attributes?.hp ?? {};
	rollData.attributes ??= {};
	rollData.attributes.shld = {
		die: sizeData.shldDice ?? "0",
		value: shields.value,
		max: shields.max,
		missing: Math.max(shields.max - shields.value, 0)
	};
	rollData.attributes.hull = {
		die: sizeData.hullDice ?? "0",
		value: Number(hull.value) || 0,
		max: Number(hull.max) || 0,
		missing: Math.max((Number(hull.max) || 0) - (Number(hull.value) || 0), 0)
	};
	return rollData;
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

	try {
		libWrapper.register(getModuleId(), "dnd5e.dataModels.actor.VehicleData.prototype.prepareDerivedData", function(wrapped, ...args) {
			const result = wrapped(...args);
			applyStarshipShieldMirror(this);
			applyStarshipRoutingMovement(this);
			return result;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn(`${HOOKS_NAMESPACE.toUpperCase()} | Skipping incompatible starship movement wrapper target.`, err);
	}

	try {
		libWrapper.register(getModuleId(), "dnd5e.documents.Actor5e.prototype.getRollData", function(wrapped, ...args) {
			const rollData = wrapped(...args);
			return applyStarshipRollData(this, rollData);
		}, "WRAPPER");
	} catch ( err ) {
		console.warn(`${HOOKS_NAMESPACE.toUpperCase()} | Skipping incompatible starship roll data wrapper target.`, err);
	}
}
