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

const STARSHIP_CHARACTER_FLAG = "starshipCharacter";
const STARSHIP_POWER_ZONES = ["central", "engines", "shields", "weapons"];

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

function toFiniteNumber(value, fallback = null) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function getLegacyPackHint(item) {
	const sourceId = item?.flags?.core?.sourceId;
	const match = /^Compendium\.[^.]+\.([^.]+)\./.exec(sourceId ?? "");
	return match?.[1] ?? null;
}

function getStarshipCharacterFlag(subject) {
	return subject?.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG] ?? null;
}

function isCharacterBackedStarship(data) {
	return data?.type === "character" && getStarshipCharacterFlag(data)?.enabled;
}

function getLegacyStarshipSize(items = []) {
	return items.find(item => item.type === "starshipsize")
		?? items.find(item => item.flags?.sw5e?.legacyStarshipSize)
		?? items.find(item => item.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.role === "classification");
}

function getLegacySizeSystem(item) {
	if ( item?.flags?.sw5e?.legacyStarshipSize ) return item.flags.sw5e.legacyStarshipSize;
	const classification = item?.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.classification;
	return classification?.raw ?? classification ?? item?.system ?? {};
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

function canPersistVehicleAbilities(abilities = {}) {
	if ( !hasOwnKeys(abilities) ) return false;
	return Object.values(abilities).every(hasPreparedAbilityShape);
}

function makeAbilityRoll(roll = {}) {
	return {
		min: toFiniteNumber(roll?.min),
		max: toFiniteNumber(roll?.max),
		mode: toFiniteNumber(roll?.mode, 0) ?? 0
	};
}

function makeAbilityStage(stage = {}, fallbackStage = {}) {
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

export function mergeVehicleAbilityValues(existingAbilities = {}, legacyAbilities = {}) {
	const current = hasOwnKeys(existingAbilities) ? existingAbilities : {};
	const legacy = hasOwnKeys(legacyAbilities) ? legacyAbilities : {};
	const keys = Object.keys(current);
	if ( !keys.length ) return undefined;

	return keys.reduce((abilities, key) => {
		abilities[key] = makeVehicleAbilityEntry(current[key], legacy[key]);
		return abilities;
	}, {});
}

export function normalizeSourceField(source) {
	if ( !source || (typeof source !== "object" && typeof source !== "string") ) return {};
	if ( typeof source === "object" ) return source;
	const trimmed = source.trim();
	return trimmed && (trimmed !== "[object Object]") ? { custom: trimmed } : {};
}

function buildLegacySystemFromCharacterStarship(actor, starshipFlag = {}) {
	const currentSystem = cloneData(actor.system ?? {});
	const legacySystem = cloneData(starshipFlag.legacySystem ?? {});
	const resources = cloneData(starshipFlag.resources ?? {});
	const details = cloneData(starshipFlag.details ?? {});
	const classification = cloneData(starshipFlag.classification ?? {});
	const currentAttributes = currentSystem.attributes ?? {};
	const legacyAttributes = (legacySystem.attributes ??= {});

	legacySystem.details ??= {};
	legacySystem.details.source = normalizeSourceField(currentSystem.details?.source ?? legacySystem.details?.source);
	legacySystem.details.tier = toFiniteNumber(details.tier, toFiniteNumber(currentSystem.details?.tier, toFiniteNumber(legacySystem.details?.tier, 0))) ?? 0;
	if ( currentSystem.details?.type !== undefined ) legacySystem.details.type = cloneData(currentSystem.details.type);

	legacySystem.traits ??= {};
	legacySystem.traits.size = classification.size ?? currentSystem.traits?.size ?? legacySystem.traits?.size ?? "med";

	legacyAttributes.ac ??= {};
	legacyAttributes.ac.flat = toFiniteNumber(
		currentAttributes.ac?.flat ?? currentAttributes.ac?.value,
		toFiniteNumber(legacyAttributes.ac.flat, 10)
	) ?? 10;

	legacyAttributes.hp ??= {};
	legacyAttributes.hp.value = toFiniteNumber(currentAttributes.hp?.value, toFiniteNumber(legacyAttributes.hp.value, 0)) ?? 0;
	legacyAttributes.hp.max = toFiniteNumber(currentAttributes.hp?.max, toFiniteNumber(legacyAttributes.hp.max, legacyAttributes.hp.value)) ?? legacyAttributes.hp.value;
	legacyAttributes.hp.temp = toFiniteNumber(currentAttributes.hp?.temp, toFiniteNumber(legacyAttributes.hp.temp, 0)) ?? 0;
	legacyAttributes.hp.tempmax = toFiniteNumber(currentAttributes.hp?.tempmax, toFiniteNumber(legacyAttributes.hp.tempmax, 0)) ?? 0;

	legacyAttributes.movement ??= {};
	legacyAttributes.movement.space = toFiniteNumber(
		currentAttributes.movement?.fly ?? currentAttributes.speed?.space,
		toFiniteNumber(legacyAttributes.movement.space, 0)
	) ?? 0;
	legacyAttributes.movement.units = currentAttributes.movement?.units ?? legacyAttributes.movement.units ?? "ft";
	legacyAttributes.movement.turn = toFiniteNumber(legacyAttributes.movement.turn, 0) ?? 0;

	legacyAttributes.systemDamage = toFiniteNumber(resources.systemDamage, toFiniteNumber(legacyAttributes.systemDamage, 0)) ?? 0;
	legacyAttributes.prof = toFiniteNumber(currentAttributes.prof, toFiniteNumber(legacyAttributes.prof, 0)) ?? 0;

	legacyAttributes.fuel ??= {};
	legacyAttributes.fuel.value = toFiniteNumber(resources.fuel?.value, toFiniteNumber(legacyAttributes.fuel.value, 0)) ?? 0;
	legacyAttributes.fuel.cost = toFiniteNumber(resources.fuel?.cost, toFiniteNumber(legacyAttributes.fuel.cost, 0)) ?? 0;
	legacyAttributes.fuel.fuelCap = toFiniteNumber(resources.fuel?.fuelCap, toFiniteNumber(legacyAttributes.fuel.fuelCap, 0)) ?? 0;

	legacyAttributes.power ??= {};
	legacyAttributes.power.routing = resources.power?.routing ?? legacyAttributes.power.routing ?? "none";
	legacyAttributes.power.die = resources.power?.die ?? legacyAttributes.power.die ?? "d1";
	for ( const zone of STARSHIP_POWER_ZONES ) {
		legacyAttributes.power[zone] ??= {};
		legacyAttributes.power[zone].value = toFiniteNumber(
			resources.power?.[zone]?.value,
			toFiniteNumber(legacyAttributes.power[zone].value, 0)
		) ?? 0;
		legacyAttributes.power[zone].max = toFiniteNumber(
			resources.power?.[zone]?.max,
			toFiniteNumber(legacyAttributes.power[zone].max, 0)
		) ?? 0;
	}

	if ( resources.deployment ) legacyAttributes.deployment = cloneData(resources.deployment);
	if ( resources.hullDice ) legacyAttributes.hull = cloneData(resources.hullDice);
	if ( resources.shieldDice ) legacyAttributes.shld = cloneData(resources.shieldDice);
	if ( resources.cost ) legacyAttributes.cost = cloneData(resources.cost);
	if ( resources.mods ) legacyAttributes.mods = cloneData(resources.mods);
	if ( resources.workforce ) legacyAttributes.workforce = cloneData(resources.workforce);
	if ( resources.equip ) legacyAttributes.equip = cloneData(resources.equip);

	if ( !hasOwnKeys(legacySystem.abilities) && hasOwnKeys(currentSystem.abilities) ) legacySystem.abilities = cloneData(currentSystem.abilities);
	if ( !hasOwnKeys(legacySystem.skills) && hasOwnKeys(currentSystem.skills) ) legacySystem.skills = cloneData(currentSystem.skills);
	return legacySystem;
}

function buildVehicleSystem(legacySystem = {}, items = [], existingSystem = {}) {
	const starshipSize = getLegacyStarshipSize(items);
	const sizeSystem = getLegacySizeSystem(starshipSize);
	const hpValue = toFiniteNumber(legacySystem.attributes?.hp?.value, toFiniteNumber(existingSystem.attributes?.hp?.value));
	const hpMax = toFiniteNumber(legacySystem.attributes?.hp?.max, hpValue);
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
	if ( isCharacterBackedStarship(data) ) return true;
	if ( data?.type !== "vehicle" ) return false;

	return Array.isArray(data.items) && data.items.some(item => {
		if ( ["starshipsize", "starshipmod", "deployment"].includes(item.type) ) return true;
		if ( item.flags?.sw5e?.legacyStarshipSize || item.flags?.sw5e?.legacyStarshipMod || item.flags?.sw5e?.legacyDeployment ) return true;
		if ( item.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.role ) return true;
		const pack = getLegacyPackHint(item);
		return pack ? LEGACY_STARSHIP_PACKS.has(pack) : false;
	});
}

export function normalizeLegacyStarshipItemData(data) {
	if ( !data || (typeof data !== "object") ) return false;

	const legacySystem = cloneData(data.system ?? {});
	const flags = ensureSw5eFlags(data);
	const characterFlag = flags[STARSHIP_CHARACTER_FLAG];
	let changed = false;

	if ( characterFlag?.role === "classification" && !flags.legacyStarshipSize ) {
		flags.legacyStarshipSize = cloneData(characterFlag.classification?.raw ?? characterFlag.classification ?? legacySystem);
		changed = true;
	}

	if ( characterFlag?.role === "modification" && !flags.legacyStarshipMod ) {
		flags.legacyStarshipMod = legacySystem;
		changed = true;
	}

	if ( ["deployment", "venture"].includes(characterFlag?.role) && !flags.legacyDeployment ) {
		flags.legacyDeployment = legacySystem;
		changed = true;
	}

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

	return changed;
}

export function normalizeLegacyStarshipActorData(data) {
	if ( !data || (typeof data !== "object") || !isLegacyStarshipLikeActor(data) ) return false;

	const flags = ensureSw5eFlags(data);
	const legacyRecord = flags.legacyStarshipActor;
	const characterRecord = flags[STARSHIP_CHARACTER_FLAG];
	const currentSystem = cloneData(data.system ?? {});
	const legacySystem = characterRecord?.enabled
		? buildLegacySystemFromCharacterStarship(data, characterRecord)
		: cloneData(legacyRecord?.type === "starship" ? legacyRecord.system ?? {} : currentSystem);

	flags.legacyStarshipActor = {
		type: "starship",
		system: legacySystem
	};

	data.type = "vehicle";
	data.flags ??= {};
	data.flags.core ??= {};
	delete data.flags.core.sheetClass;
	data.system = buildVehicleSystem(legacySystem, data.items ?? [], currentSystem);

	const abilities = mergeVehicleAbilityValues(currentSystem.abilities, legacySystem.abilities);
	if ( canPersistVehicleAbilities(abilities) ) data.system.abilities = abilities;

	if ( Array.isArray(data.items) ) {
		for ( const item of data.items ) normalizeLegacyStarshipItemData(item);
	}

	return true;
}

export function getLegacyStarshipActorSystem(actor) {
	return actor?.flags?.sw5e?.legacyStarshipActor?.system ?? {};
}

function getProficiencyLevels() {
	return CONFIG?.DND5E?.proficiencyLevels ?? CONFIG?.SW5E?.proficiencyLevels ?? {};
}

function getStarshipSkillsConfig() {
	return CONFIG?.DND5E?.starshipSkills ?? CONFIG?.SW5E?.starshipSkills ?? {};
}

function getSkillBonus(skill = {}) {
	return toFiniteNumber(skill?.bonuses?.check, 0) ?? 0;
}

export function getStarshipSkillEntries(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const skillConfig = getStarshipSkillsConfig();
	const proficiencyLevels = getProficiencyLevels();
	const baseProficiency = toFiniteNumber(legacySystem.attributes?.prof, 0) ?? 0;

	return Object.entries(skillConfig).map(([key, config]) => {
		const skill = legacySystem.skills?.[key] ?? {};
		const ability = config.ability ?? skill.ability ?? "int";
		const abilityValue = toFiniteNumber(actor?.system?.abilities?.[ability]?.value, toFiniteNumber(legacySystem.abilities?.[ability]?.value, 10)) ?? 10;
		const abilityMod = Math.floor((abilityValue - 10) / 2);
		const proficiencyMode = toFiniteNumber(skill.value, 0) ?? 0;
		const multiplier = Number(proficiencyLevels?.[proficiencyMode]?.mult ?? 0);
		const proficiency = Math.round(baseProficiency * multiplier);
		const bonus = getSkillBonus(skill);
		return {
			id: key,
			label: config.label ?? key,
			ability,
			abilityLabel: CONFIG?.DND5E?.abilities?.[ability]?.label ?? ability.toUpperCase(),
			proficiencyMode,
			hover: proficiencyLevels?.[proficiencyMode]?.label ?? "",
			total: abilityMod + proficiency + bonus,
			parts: {
				abilityMod,
				proficiency,
				bonus
			}
		};
	}).sort((left, right) => left.label.localeCompare(right.label));
}

function getStarshipAdvantageMode(event) {
	const advantageModes = CONFIG?.Dice?.D20Roll?.ADV_MODE ?? {};
	const normal = advantageModes.NORMAL ?? 0;
	const advantage = advantageModes.ADVANTAGE ?? 1;
	const disadvantage = advantageModes.DISADVANTAGE ?? -1;

	if ( event?.altKey ) return advantage;
	if ( event?.ctrlKey || event?.metaKey ) return disadvantage;
	return normal;
}

export async function rollStarshipSkill(actor, skillId, event) {
	const entry = getStarshipSkillEntries(actor).find(skill => skill.id === skillId);
	if ( !entry ) return null;

	const parts = ["@abilityMod"];
	if ( entry.parts.proficiency ) parts.push("@proficiency");
	if ( entry.parts.bonus ) parts.push("@bonus");
	const formula = `1d20 + ${parts.join(" + ")}`;
	const roll = new CONFIG.Dice.D20Roll(formula, {
		abilityMod: entry.parts.abilityMod,
		proficiency: entry.parts.proficiency,
		bonus: entry.parts.bonus
	}, {
		flavor: `${actor.name}: ${entry.label}`,
		advantageMode: getStarshipAdvantageMode(event),
		defaultRollMode: game.settings.get("core", "rollMode")
	});

	await roll.evaluate();
	await roll.toMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: `${entry.label} (${entry.abilityLabel})`
	});
	return roll;
}

export const normalizeLegacyStarshipActorSource = normalizeLegacyStarshipActorData;
export const normalizeLegacyStarshipItemSource = normalizeLegacyStarshipItemData;
