const LEGACY_STARSHIP_PACKS = new Set([
	"starshipactions",
	"starshiparmor",
	"starshipequipment",
	"starshipfeatures",
	"starshipmodifications",
	"starships",
	"starshipweapons",
	"deployments",
	"deploymentfeatures",
	"ventures"
]);

function cloneData(data) {
	if ( data === undefined ) return undefined;
	if ( typeof globalThis.structuredClone === "function" ) return globalThis.structuredClone(data);
	return JSON.parse(JSON.stringify(data));
}

function ensureSw5eFlags(data) {
	const flags = (data.flags ??= {});
	return (flags.sw5e ??= {});
}

function hasOwnKeys(value) {
	return !!value && (typeof value === "object") && !Array.isArray(value) && (Object.keys(value).length > 0);
}

function toFiniteNumber(value, fallback=null) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function getLegacyPackHint(item) {
	const sourceId = item?.flags?.core?.sourceId;
	const match = /^Compendium\.[^.]+\.([^.]+)\./.exec(sourceId ?? "");
	return match?.[1] ?? null;
}

function getLegacyStarshipSize(items=[]) {
	return items.find(item => item.type === "starshipsize")
		?? items.find(item => item.flags?.sw5e?.legacyStarshipSize);
}

function getLegacyAbilityValue(currentAbility, legacyAbility) {
	if ( currentAbility && (typeof currentAbility === "object") ) {
		const directValue = toFiniteNumber(currentAbility.value);
		if ( directValue !== null ) return directValue;
	}

	const scalarValue = toFiniteNumber(currentAbility);
	if ( scalarValue !== null ) return scalarValue;

	if ( legacyAbility && (typeof legacyAbility === "object") ) {
		const legacyValue = toFiniteNumber(legacyAbility.value);
		if ( legacyValue !== null ) return legacyValue;
	}

	return 10;
}

function hasPreparedAbilityShape(ability) {
	return !!ability
		&& (typeof ability === "object")
		&& !!ability.save
		&& (typeof ability.save === "object")
		&& !!ability.check
		&& (typeof ability.check === "object");
}

function canPersistVehicleAbilities(abilities={}) {
	if ( !hasOwnKeys(abilities) ) return false;
	return Object.values(abilities).every(hasPreparedAbilityShape);
}

function makeAbilityRoll(roll={}) {
	return {
		min: toFiniteNumber(roll?.min),
		max: toFiniteNumber(roll?.max),
		mode: toFiniteNumber(roll?.mode, 0) ?? 0
	};
}

function makeAbilityStage(stage={}, fallbackStage={}) {
	return {
		value: toFiniteNumber(stage?.value, toFiniteNumber(fallbackStage?.value, 0)) ?? 0,
		roll: makeAbilityRoll(stage?.roll ?? fallbackStage?.roll)
	};
}

function makeVehicleAbilityEntry(currentAbility, legacyAbility) {
	const current = currentAbility && (typeof currentAbility === "object") ? cloneData(currentAbility) : {};
	const fallback = legacyAbility && (typeof legacyAbility === "object") ? legacyAbility : {};
	const ability = hasOwnKeys(current) ? current : {};

	ability.value = getLegacyAbilityValue(currentAbility, legacyAbility);
	ability.proficient = toFiniteNumber(ability.proficient, toFiniteNumber(fallback.proficient, 0)) ?? 0;
	ability.max = toFiniteNumber(ability.max, toFiniteNumber(fallback.max));
	ability.bonuses = {
		check: ability.bonuses?.check ?? fallback.bonuses?.check ?? "",
		save: ability.bonuses?.save ?? fallback.bonuses?.save ?? ""
	};
	ability.check = makeAbilityStage(ability.check, fallback.check);
	ability.save = makeAbilityStage(ability.save, fallback.save);
	return ability;
}

export function mergeVehicleAbilityValues(existingAbilities={}, legacyAbilities={}) {
	const current = hasOwnKeys(existingAbilities) ? existingAbilities : {};
	const legacy = hasOwnKeys(legacyAbilities) ? legacyAbilities : {};
	const keys = Object.keys(current);
	if ( !keys.length ) return undefined;

	return keys.reduce((abilities, key) => {
		abilities[key] = makeVehicleAbilityEntry(current[key], legacy[key]);
		return abilities;
	}, {});
}

function buildVehicleSystem(legacySystem={}, items=[], existingSystem={}) {
	const starshipSize = getLegacyStarshipSize(items);
	const sizeSystem = starshipSize?.flags?.sw5e?.legacyStarshipSize ?? starshipSize?.system ?? {};
	const hpValue = toFiniteNumber(legacySystem.attributes?.hp?.value, toFiniteNumber(existingSystem.attributes?.hp?.value));
	const hpMax = toFiniteNumber(legacySystem.attributes?.hp?.max, hpValue);
	const shieldValue = toFiniteNumber(legacySystem.attributes?.hp?.temp, toFiniteNumber(existingSystem.attributes?.hp?.temp, 0)) ?? 0;
	const shieldMax = toFiniteNumber(legacySystem.attributes?.hp?.tempmax, toFiniteNumber(existingSystem.attributes?.hp?.tempmax, 0)) ?? 0;
	const cargoCap = toFiniteNumber(sizeSystem.cargoCap, toFiniteNumber(existingSystem.attributes?.capacity?.cargo, 0)) ?? 0;
	const flySpeed = toFiniteNumber(sizeSystem.baseSpaceSpeed, toFiniteNumber(existingSystem.attributes?.movement?.fly, 0)) ?? 0;
	const acFlat = toFiniteNumber(legacySystem.attributes?.ac?.flat, toFiniteNumber(existingSystem.attributes?.ac?.flat, 10)) ?? 10;

	return {
		vehicleType: existingSystem.vehicleType || "air",
		attributes: {
			ac: {
				calc: "flat",
				flat: acFlat,
				motionless: existingSystem.attributes?.ac?.motionless ?? ""
			},
			actions: {
				stations: existingSystem.attributes?.actions?.stations ?? true
			},
			hp: {
				value: hpValue,
				max: hpMax,
				temp: Math.min(shieldValue, shieldMax),
				tempmax: shieldMax,
				dt: existingSystem.attributes?.hp?.dt ?? null,
				mt: existingSystem.attributes?.hp?.mt ?? null
			},
			capacity: {
				creature: existingSystem.attributes?.capacity?.creature ?? "",
				cargo: cargoCap
			},
			movement: {
				fly: flySpeed,
				units: existingSystem.attributes?.movement?.units ?? "ft",
				hover: existingSystem.attributes?.movement?.hover ?? true
			}
		},
		details: {
			source: normalizeSourceField(legacySystem.details?.source)
		},
		traits: {
			size: sizeSystem.size ?? existingSystem.traits?.size ?? legacySystem.traits?.size ?? "med",
			dimensions: existingSystem.traits?.dimensions ?? "",
			di: cloneData(existingSystem.traits?.di) ?? cloneData(legacySystem.traits?.di) ?? { value: [], bypasses: [], custom: "" },
			ci: cloneData(existingSystem.traits?.ci) ?? cloneData(legacySystem.traits?.ci) ?? { value: [], custom: "" }
		},
		cargo: {
			crew: cloneData(existingSystem.cargo?.crew) ?? [],
			passengers: cloneData(existingSystem.cargo?.passengers) ?? []
		}
	};
}

function isLegacyStarshipLikeActor(data) {
	if ( data?.type === "starship" ) return true;
	if ( data?.flags?.sw5e?.legacyStarshipActor?.type === "starship" ) return true;
	if ( data?.type !== "vehicle" ) return false;

	return Array.isArray(data.items) && data.items.some(item => {
		if ( ["starshipsize", "starshipmod", "deployment"].includes(item.type) ) return true;
		if ( item.flags?.sw5e?.legacyStarshipSize || item.flags?.sw5e?.legacyStarshipMod || item.flags?.sw5e?.legacyDeployment ) return true;
		const pack = getLegacyPackHint(item);
		return pack ? LEGACY_STARSHIP_PACKS.has(pack) : false;
	});
}

export function normalizeSourceField(source) {
	if ( !source || (typeof source !== "object" && typeof source !== "string") ) return {};
	if ( typeof source === "object" ) return source;
	const trimmed = source.trim();
	return trimmed && (trimmed !== "[object Object]") ? { custom: trimmed } : {};
}

export function normalizeLegacyStarshipActorData(data) {
	if ( !data || (typeof data !== "object") || !isLegacyStarshipLikeActor(data) ) return false;

	const flags = ensureSw5eFlags(data);
	const legacyRecord = flags.legacyStarshipActor;
	const currentSystem = cloneData(data.system ?? {});
	const legacySystem = cloneData(legacyRecord?.type === "starship" ? legacyRecord.system ?? {} : currentSystem);

	flags.legacyStarshipActor = {
		type: "starship",
		system: legacySystem
	};

	data.type = "vehicle";
	data.system = buildVehicleSystem(legacySystem, data.items ?? [], currentSystem);
	const abilities = mergeVehicleAbilityValues(currentSystem.abilities, legacySystem.abilities);
	if ( canPersistVehicleAbilities(abilities) ) data.system.abilities = abilities;
	return true;
}

export function normalizeLegacyStarshipItemData(data) {
	if ( !data || (typeof data !== "object") ) return false;

	const legacySystem = cloneData(data.system ?? {});
	const flags = ensureSw5eFlags(data);

	switch ( data.type ) {
		case "deployment":
			flags.legacyDeployment = legacySystem;
			data.type = "feat";
			data.system = {
				description: cloneData(legacySystem.description) ?? { value: "", chat: "" },
				source: normalizeSourceField(legacySystem.source),
				type: {
					value: "deployment",
					subtype: ""
				},
				advancement: cloneData(legacySystem.advancement) ?? []
			};
			return true;

		case "starshipsize":
			flags.legacyStarshipSize = legacySystem;
			data.type = "feat";
			data.system = {
				description: cloneData(legacySystem.description) ?? { value: "", chat: "" },
				source: normalizeSourceField(legacySystem.source),
				type: {
					value: "starship",
					subtype: ""
				},
				advancement: cloneData(legacySystem.advancement) ?? []
			};
			return true;

		case "starshipmod":
			flags.legacyStarshipMod = legacySystem;
			data.type = "loot";
			data.system = {
				description: cloneData(legacySystem.description) ?? { value: "", chat: "" },
				source: normalizeSourceField(legacySystem.source),
				quantity: legacySystem.quantity ?? 1,
				weight: cloneData(legacySystem.weight) ?? { value: 0, units: "lb" },
				price: cloneData(legacySystem.price) ?? { value: 0, denomination: "gp" },
				rarity: legacySystem.rarity ?? "",
				identified: legacySystem.identified ?? true
			};
			if ( legacySystem.container !== undefined ) data.system.container = legacySystem.container;
			return true;
	}

	return false;
}
