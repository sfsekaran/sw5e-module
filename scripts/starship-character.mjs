import { getModuleId } from "./module-support.mjs";

export const STARSHIP_CHARACTER_FLAG = "starshipCharacter";
export const STARSHIP_CHARACTER_SHEET_CLASS = "Sw5eStarshipCharacterSheet";

const STARSHIP_ITEM_TYPE_MAP = {
	deployment: "feat",
	starshipmod: "loot",
	starshipsize: "feat",
	venture: "feat"
};

function cloneDeep(data) {
	if ( globalThis.foundry?.utils?.deepClone ) return globalThis.foundry.utils.deepClone(data);
	if ( data === undefined ) return undefined;
	if ( typeof globalThis.structuredClone === "function" ) return globalThis.structuredClone(data);
	return JSON.parse(JSON.stringify(data));
}

function deepEqual(left, right) {
	if ( globalThis.foundry?.utils?.deepEqual ) return globalThis.foundry.utils.deepEqual(left, right);
	return JSON.stringify(left) === JSON.stringify(right);
}

function getSafeModuleId() {
	try {
		return getModuleId();
	} catch {
		return "sw5e-module";
	}
}

function cloneData(data) {
	return cloneDeep(data ?? {});
}

function toNumber(value, fallback = 0) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeSourceField(source) {
	if ( source && typeof source === "object" ) return cloneData(source);
	if ( typeof source === "string" ) return { custom: source === "[object Object]" ? "" : source };
	return { custom: "" };
}

function countCollection(value) {
	if ( Array.isArray(value) ) return value.length;
	if ( value instanceof Set ) return value.size;
	if ( value && typeof value === "object" ) {
		if ( Array.isArray(value.items) ) return value.items.length;
		if ( value.items instanceof Set ) return value.items.size;
	}
	return 0;
}

function normalizeAbilitySet(legacyAbilities = {}) {
	const baseAbilityKeys = ["str", "dex", "con", "int", "wis", "cha"];
	return baseAbilityKeys.reduce((abilities, key) => {
		const legacy = legacyAbilities[key] ?? {};
		abilities[key] = {
			value: toNumber(legacy.value, 10),
			proficient: toNumber(legacy.proficient, 0),
			bonuses: {
				check: legacy.bonuses?.check ?? "",
				save: legacy.bonuses?.save ?? ""
			}
		};
		return abilities;
	}, {});
}

function buildClassificationRecord(item) {
	if ( !item ) return null;
	const data = cloneData(item.system);
	return {
		id: item._id ?? null,
		name: item.name ?? "",
		img: item.img ?? "",
		identifier: data.identifier ?? "",
		size: data.size ?? "med",
		tier: toNumber(data.tier, 0),
		hullDice: data.hullDice ?? "",
		hullDiceStart: toNumber(data.hullDiceStart, 0),
		hullDiceUsed: toNumber(data.hullDiceUsed, 0),
		shldDice: data.shldDice ?? "",
		shldDiceStart: toNumber(data.shldDiceStart, 0),
		shldDiceUsed: toNumber(data.shldDiceUsed, 0),
		fuelCap: toNumber(data.fuelCap, 0),
		fuelCost: toNumber(data.fuelCost, 0),
		powerDie: data.powerDie ?? "",
		buildBaseCost: toNumber(data.buildBaseCost, 0),
		raw: data
	};
}

function disableLegacyEffects(owner) {
	if ( !Array.isArray(owner?.effects) ) return false;
	let changed = false;
	for (const effect of owner.effects) {
		effect.flags ??= {};
		effect.flags.sw5e ??= {};
		effect.flags.sw5e[STARSHIP_CHARACTER_FLAG] ??= {};
		effect.flags.sw5e[STARSHIP_CHARACTER_FLAG].suppressed = true;
		if ( effect.disabled !== true ) {
			effect.disabled = true;
			changed = true;
		}
		if ( effect.transfer ) {
			effect.transfer = false;
			changed = true;
		}
	}
	return changed;
}

function preserveStarshipActorData(actor, classification) {
	const legacySystem = cloneData(actor.system);
	const legacyAttributes = legacySystem.attributes ?? {};
	const deployment = cloneData(legacyAttributes.deployment);
	return {
		enabled: true,
		version: 1,
		legacyActorType: actor.type ?? "starship",
		classification,
		abilities: cloneData(legacySystem.abilities),
		skills: cloneData(legacySystem.skills),
		details: {
			source: normalizeSourceField(legacySystem.details?.source),
			tier: classification?.tier ?? toNumber(legacySystem.details?.tier, 0),
			starshipsize: cloneData(legacySystem.details?.starshipsize)
		},
		resources: {
			fuel: cloneData(legacyAttributes.fuel),
			power: cloneData(legacyAttributes.power),
			deployment,
			crewSummary: {
				pilotAssigned: Boolean(deployment?.pilot?.value),
				crewCount: countCollection(deployment?.crew),
				passengerCount: countCollection(deployment?.passenger),
				activeUuid: deployment?.active?.value ?? null
			},
			hullDice: cloneData(legacyAttributes.hull),
			shieldDice: cloneData(legacyAttributes.shld),
			systemDamage: toNumber(legacyAttributes.systemDamage, 0),
			cost: cloneData(legacyAttributes.cost),
			workforce: cloneData(legacyAttributes.workforce),
			equipment: cloneData(legacyAttributes.equip)
		},
		legacySystem
	};
}

function buildCharacterSystem(actor, preservedStarship) {
	const legacySystem = actor.system ?? {};
	const legacyAttributes = legacySystem.attributes ?? {};
	const legacyHp = legacyAttributes.hp ?? {};
	const classification = preservedStarship.classification ?? {};
	const source = normalizeSourceField(legacySystem.details?.source);

	return {
		abilities: normalizeAbilitySet(legacySystem.abilities),
		attributes: {
			ac: {
				flat: toNumber(legacyAttributes.ac?.flat ?? legacyAttributes.ac?.value, 10),
				calc: "flat"
			},
			hp: {
				value: toNumber(legacyHp.value, 0),
				max: toNumber(legacyHp.max ?? legacyHp.value, 0),
				temp: toNumber(legacyHp.temp, 0),
				tempmax: toNumber(legacyHp.tempmax, 0)
			},
			movement: {
				walk: 0,
				fly: toNumber(legacyAttributes?.movement?.fly ?? legacyAttributes?.speed?.space, 0),
				hover: true,
				units: "ft"
			}
		},
		currency: {
			gp: 0,
			sp: 0,
			cp: 0,
			ep: 0,
			pp: 0
		},
		details: {
			source,
			biography: cloneData(legacySystem.details?.biography ?? { value: "", public: "" })
		},
		favorites: Array.isArray(legacySystem.favorites) ? cloneData(legacySystem.favorites) : [],
		traits: {
			size: classification.size ?? legacySystem.traits?.size ?? "med"
		}
	};
}

function ensureStarshipItemFlags(item, legacyType) {
	item.flags ??= {};
	item.flags.sw5e ??= {};
	item.flags.sw5e[STARSHIP_CHARACTER_FLAG] ??= {};
	item.flags.sw5e[STARSHIP_CHARACTER_FLAG].legacyItemType ??= legacyType ?? item.type ?? "";
	return item.flags.sw5e[STARSHIP_CHARACTER_FLAG];
}

function normalizeItemSourceField(item) {
	if ( item.system?.source === undefined ) return false;
	const normalized = normalizeSourceField(item.system.source);
	if ( deepEqual(normalized, item.system.source) ) return false;
	item.system.source = normalized;
	return true;
}

export function normalizeLegacyStarshipItemSource(item) {
	if ( !item || typeof item !== "object" ) return false;
	let changed = false;
	const originalType = item.type;
	const normalizedType = STARSHIP_ITEM_TYPE_MAP[originalType];

	item.system ??= {};
	if ( normalizeItemSourceField(item) ) changed = true;

	if ( item.system?.target?.type === "starship" ) {
		item.system.target.type = "";
		changed = true;
	}

	if ( normalizedType ) {
		const flagData = ensureStarshipItemFlags(item, originalType);
		flagData.originalName ??= item.name ?? "";
		flagData.legacySystem ??= cloneData(item.system);
		if ( item.type !== normalizedType ) {
			item.type = normalizedType;
			changed = true;
		}

		if ( originalType === "starshipsize" ) {
			flagData.role = "classification";
			flagData.classification = buildClassificationRecord(item);
			item.system.type ??= {};
			if ( item.system.type.value !== "starship" ) {
				item.system.type.value = "starship";
				changed = true;
			}
			if ( item.system.type.subtype !== "classification" ) {
				item.system.type.subtype = "classification";
				changed = true;
			}
		}

		if ( originalType === "starshipmod" ) {
			flagData.role = "modification";
		}

		if ( (originalType === "deployment") || (originalType === "venture") ) {
			flagData.role = originalType;
			item.system.type ??= {};
			if ( item.system.type.value !== "deployment" ) {
				item.system.type.value = "deployment";
				changed = true;
			}
			if ( item.system.type.subtype !== originalType ) {
				item.system.type.subtype = originalType;
				changed = true;
			}
		}
	}

	if ( disableLegacyEffects(item) ) changed = true;
	return changed;
}

export function normalizeLegacyStarshipActorSource(actor) {
	if ( !actor || typeof actor !== "object" ) return false;
	const existingFlag = actor.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG];
	const isLegacyStarship = actor.type === "starship";
	const isNormalizedStarship = actor.type === "character" && existingFlag?.enabled;
	if ( !isLegacyStarship && !isNormalizedStarship ) return false;

	let changed = false;
	const classificationItem = Array.isArray(actor.items)
		? actor.items.find(item => item?.type === "starshipsize"
			|| item?.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.role === "classification")
		: null;
	const preservedStarship = preserveStarshipActorData(actor, buildClassificationRecord(classificationItem));

	if ( actor.type !== "character" ) {
		actor.type = "character";
		changed = true;
	}

	actor.flags ??= {};
	actor.flags.core ??= {};
	if ( actor.flags.core.sheetClass !== getStarshipCharacterSheetClassId() ) {
		actor.flags.core.sheetClass = getStarshipCharacterSheetClassId();
		changed = true;
	}
	actor.flags.sw5e ??= {};
	if ( !deepEqual(actor.flags.sw5e[STARSHIP_CHARACTER_FLAG], preservedStarship) ) {
		actor.flags.sw5e[STARSHIP_CHARACTER_FLAG] = preservedStarship;
		changed = true;
	}

	const nextSystem = buildCharacterSystem(actor, preservedStarship);
	if ( !deepEqual(actor.system, nextSystem) ) {
		actor.system = nextSystem;
		changed = true;
	}

	if ( Array.isArray(actor.items) ) {
		for (const item of actor.items) {
			if ( normalizeLegacyStarshipItemSource(item) ) changed = true;
		}
	}

	if ( disableLegacyEffects(actor) ) changed = true;
	return changed;
}

export function getStarshipCharacterSheetClassId() {
	return `${getSafeModuleId()}.${STARSHIP_CHARACTER_SHEET_CLASS}`;
}

export function getStarshipCharacterFlag(subject) {
	return subject?.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG] ?? null;
}

export function isStarshipCharacterActor(subject) {
	const flag = getStarshipCharacterFlag(subject);
	return subject?.type === "character" && flag?.enabled === true;
}

export function getStarshipClassification(subject) {
	const flag = getStarshipCharacterFlag(subject);
	return flag?.classification ?? null;
}

export function buildStarshipSkillEntries(subject) {
	const flag = getStarshipCharacterFlag(subject);
	const skillConfig = CONFIG.DND5E.starshipSkills ?? {};
	const legacySkills = flag?.skills ?? {};
	const abilities = flag?.abilities ?? {};
	const proficiency = toNumber(subject?.system?.attributes?.prof ?? flag?.legacySystem?.attributes?.prof, 0);

	return Object.entries(skillConfig).map(([key, config]) => {
		const legacySkill = legacySkills[key] ?? {};
		const abilityKey = legacySkill.ability ?? config.ability ?? "int";
		const abilityScore = toNumber(abilities[abilityKey]?.value, 10);
		const abilityMod = Math.floor((abilityScore - 10) / 2);
		const proficiencyMultiplier = toNumber(legacySkill.value, 0);
		const total = abilityMod + (proficiency * proficiencyMultiplier);
		return {
			key,
			label: game.i18n.localize(config.label),
			ability: abilityKey,
			abilityLabel: game.i18n.localize(CONFIG.DND5E.abilities?.[abilityKey]?.label ?? abilityKey.toUpperCase()),
			proficiency: proficiencyMultiplier,
			total
		};
	}).sort((a, b) => a.label.localeCompare(b.label));
}

export function buildStarshipItemGroups(actor) {
	const groups = {
		actions: [],
		classification: [],
		deployments: [],
		features: [],
		modifications: [],
		systems: [],
		weapons: []
	};

	for (const item of actor.items ?? []) {
		const role = item.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.role;
		const typeValue = item.system?.type?.value ?? "";
		if ( role === "classification" ) groups.classification.push(item);
		else if ( item.type === "weapon" ) groups.weapons.push(item);
		else if ( typeValue === "starshipAction" ) groups.actions.push(item);
		else if ( typeValue === "deployment" ) groups.deployments.push(item);
		else if ( role === "modification" || item.type === "loot" ) groups.modifications.push(item);
		else if ( item.type === "equipment" ) groups.systems.push(item);
		else groups.features.push(item);
	}

	return groups;
}
