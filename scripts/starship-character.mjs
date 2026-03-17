import { getModuleId } from "./module-support.mjs";

export const STARSHIP_CHARACTER_FLAG = "starshipCharacter";
export const STARSHIP_CHARACTER_SHEET_CLASS = "Sw5eStarshipCharacterSheet";
export const STARSHIP_CREW_DEPLOYMENT_FLAG = "starshipDeployment";

const STARSHIP_ITEM_TYPE_MAP = {
	deployment: "feat",
	starshipmod: "loot",
	starshipsize: "feat",
	venture: "feat"
};

const POWER_DIE_TYPES = ["d1", "d4", "d6", "d8", "d10", "d12"];
const SS_BASE_UPGRADE_COST = [0, 3900, 77500, 297000, 620000, 1150000];
const STARSHIP_POWER_ZONES = ["central", "comms", "engines", "shields", "sensors", "weapons"];
const STARSHIP_DEPLOYMENT_ROLES = ["pilot", "crew", "passenger"];

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

function coalesceNumber(...values) {
	for (const value of values) {
		const numeric = Number(value);
		if ( Number.isFinite(numeric) ) return numeric;
	}
	return 0;
}

function normalizeSourceField(source) {
	if ( source && typeof source === "object" ) return cloneData(source);
	if ( typeof source === "string" ) return { custom: source === "[object Object]" ? "" : source };
	return { custom: "" };
}

function normalizeCreatureTypeField(typeData) {
	const normalized = (typeData && typeof typeData === "object") ? cloneData(typeData) : {};
	normalized.value ??= "starship";
	normalized.subtype ??= "";
	normalized.custom ??= "";
	return normalized;
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

function normalizeUuidSet(value) {
	if ( value instanceof Set ) return Array.from(value).filter(Boolean);
	if ( Array.isArray(value) ) return value.filter(Boolean);
	if ( value && typeof value === "object" ) {
		if ( value.items instanceof Set ) return Array.from(value.items).filter(Boolean);
		if ( Array.isArray(value.items) ) return value.items.filter(Boolean);
		if ( Array.isArray(value.value) ) return value.value.filter(Boolean);
	}
	return [];
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

function getStarshipClassificationItem(actor) {
	if ( !actor?.items ) return null;
	return actor.items.find(item => item?.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.role === "classification")
		?? actor.items.find(item => item?.type === "starshipsize");
}

function getStarshipClassificationData(actor) {
	const classification = getStarshipClassification(actor);
	if ( classification ) return classification;
	const item = getStarshipClassificationItem(actor);
	if ( !item ) return null;
	return item.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.classification ?? buildClassificationRecord(item);
}

function getEquippedStarshipItem(actor, typeValue) {
	if ( !actor?.items ) return null;
	return actor.items.find(item => {
		if ( item.type !== "equipment" ) return false;
		if ( item.system?.equipped === false ) return false;
		return item.system?.type?.value === typeValue;
	}) ?? null;
}

function resolveActorDocument(subject) {
	if ( !subject ) return null;
	if ( subject.documentName === "Actor" ) return subject;
	if ( typeof subject === "string" ) {
		return globalThis.fromUuidSync?.(subject)
			?? globalThis.game?.actors?.get(subject)
			?? null;
	}
	return null;
}

function isDeployableCrewActor(subject) {
	const actor = resolveActorDocument(subject);
	if ( !actor ) return false;
	return ["character", "npc"].includes(actor.type) && !isStarshipCharacterActor(actor);
}

function getCrewDeploymentFlag(actor) {
	return actor?.flags?.sw5e?.[STARSHIP_CREW_DEPLOYMENT_FLAG] ?? null;
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
	const tier = preservedStarship.details?.tier ?? classification.tier ?? toNumber(legacySystem.details?.tier, 0);
	const creatureType = normalizeCreatureTypeField(legacySystem.details?.type);

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
			biography: cloneData(legacySystem.details?.biography ?? { value: "", public: "" }),
			tier,
			type: creatureType
		},
		favorites: Array.isArray(legacySystem.favorites) ? cloneData(legacySystem.favorites) : [],
		traits: {
			size: classification.size ?? legacySystem.traits?.size ?? "med"
		}
	};
}

function getPowerZoneState(existingPower = {}, preservedPower = {}, zone) {
	return {
		value: coalesceNumber(existingPower?.[zone]?.value, preservedPower?.[zone]?.value, 0),
		max: coalesceNumber(existingPower?.[zone]?.max, preservedPower?.[zone]?.max, 0)
	};
}

function getDeploymentState(existingDeployment = {}, preservedDeployment = {}) {
	return {
		pilot: {
			value: existingDeployment?.pilot?.value ?? preservedDeployment?.pilot?.value ?? null,
			active: Boolean(existingDeployment?.pilot?.active ?? preservedDeployment?.pilot?.active)
		},
		crew: {
			items: new Set(normalizeUuidSet(existingDeployment?.crew ?? preservedDeployment?.crew)),
			active: Boolean(existingDeployment?.crew?.active ?? preservedDeployment?.crew?.active)
		},
		passenger: {
			items: new Set(normalizeUuidSet(existingDeployment?.passenger ?? preservedDeployment?.passenger)),
			active: Boolean(existingDeployment?.passenger?.active ?? preservedDeployment?.passenger?.active)
		},
		active: {
			value: existingDeployment?.active?.value ?? preservedDeployment?.active?.value ?? null
		}
	};
}

function cloneStarshipDeployment(starship) {
	return getDeploymentState(
		starship?.system?._source?.attributes?.deployment ?? starship?.system?.attributes?.deployment,
		getStarshipCharacterFlag(starship)?.resources?.deployment
	);
}

function collectDeploymentUuids(deployment) {
	const uuids = new Set();
	if ( deployment?.pilot?.value ) uuids.add(deployment.pilot.value);
	for (const uuid of normalizeUuidSet(deployment?.crew)) uuids.add(uuid);
	for (const uuid of normalizeUuidSet(deployment?.passenger)) uuids.add(uuid);
	return uuids;
}

function getDeploymentRolesForUuid(deployment, uuid) {
	if ( !uuid ) return [];
	const roles = [];
	if ( deployment?.pilot?.value === uuid ) roles.push("pilot");
	if ( deployment?.crew?.items?.has?.(uuid) ) roles.push("crew");
	if ( deployment?.passenger?.items?.has?.(uuid) ) roles.push("passenger");
	return roles;
}

function syncDeploymentActiveFlags(deployment) {
	const activeUuid = deployment?.active?.value ?? null;
	if ( activeUuid && !collectDeploymentUuids(deployment).has(activeUuid) ) {
		deployment.active.value = null;
	}
	const currentActive = deployment?.active?.value ?? null;
	deployment.pilot.active = Boolean(currentActive && (deployment.pilot.value === currentActive));
	deployment.crew.active = Boolean(currentActive && deployment.crew.items.has(currentActive));
	deployment.passenger.active = Boolean(currentActive && deployment.passenger.items.has(currentActive));
	return deployment;
}

function buildDeploymentUpdateData(deployment) {
	syncDeploymentActiveFlags(deployment);
	return {
		"system.attributes.deployment.pilot.value": deployment.pilot.value,
		"system.attributes.deployment.pilot.active": deployment.pilot.active,
		"system.attributes.deployment.crew.items": Array.from(deployment.crew.items),
		"system.attributes.deployment.crew.active": deployment.crew.active,
		"system.attributes.deployment.passenger.items": Array.from(deployment.passenger.items),
		"system.attributes.deployment.passenger.active": deployment.passenger.active,
		"system.attributes.deployment.active.value": deployment.active.value
	};
}

function buildCrewDeploymentFlagData(starship, roles) {
	return {
		starshipUuid: starship.uuid,
		starshipName: starship.name ?? "",
		roles: Array.from(new Set(roles)).sort()
	};
}

async function updateCrewDeploymentFlag(actor, starship, roles) {
	const normalizedRoles = Array.from(new Set(roles)).filter(role => STARSHIP_DEPLOYMENT_ROLES.includes(role));
	if ( !normalizedRoles.length ) {
		return actor.update({
			[`flags.sw5e.-=${STARSHIP_CREW_DEPLOYMENT_FLAG}`]: null
		});
	}
	return actor.update({
		[`flags.sw5e.${STARSHIP_CREW_DEPLOYMENT_FLAG}`]: buildCrewDeploymentFlagData(starship, normalizedRoles)
	});
}

function buildResolvedCrewRecord(deployment, uuid) {
	const actor = resolveActorDocument(uuid);
	const roles = getDeploymentRolesForUuid(deployment, uuid);
	return {
		uuid,
		name: actor?.name ?? "Unknown Crew",
		img: actor?.img ?? "icons/svg/mystery-man.svg",
		type: actor?.type ?? "",
		isPilot: roles.includes("pilot"),
		isCrew: roles.includes("crew"),
		isPassenger: roles.includes("passenger"),
		active: deployment.active.value === uuid,
		roles,
		proficiency: toNumber(actor?.system?.attributes?.prof, 0),
		pilotSkill: toNumber(actor?.system?.skills?.pil?.value, 0)
	};
}

function compareCrewRecords(left, right) {
	if ( left.isPilot !== right.isPilot ) return left.isPilot ? -1 : 1;
	if ( left.active !== right.active ) return left.active ? -1 : 1;
	return left.name.localeCompare(right.name);
}

function buildResolvedCrewActions(deployment) {
	const entries = [];
	for (const uuid of normalizeUuidSet(deployment?.crew)) {
		const actor = resolveActorDocument(uuid);
		if ( !actor ) continue;
		const isActive = deployment.active.value === uuid;
		for (const item of actor.items ?? []) {
			if ( item.type !== "feat" ) continue;
			if ( item.system?.type?.value !== "deployment" ) continue;
			entries.push({
				id: `${uuid}:${item.id ?? item._id}`,
				itemId: item.id ?? item._id,
				sourceActorUuid: uuid,
				sourceActorName: actor.name,
				name: item.name,
				img: item.img,
				typeLabel: item.system?.type?.subtype ?? "deployment",
				active: isActive
			});
		}
	}
	return entries.sort((left, right) => {
		if ( left.active !== right.active ) return left.active ? -1 : 1;
		const sourceSort = left.sourceActorName.localeCompare(right.sourceActorName);
		return sourceSort || left.name.localeCompare(right.name);
	});
}

function buildResolvedCrewRoster(deployment) {
	return Array.from(collectDeploymentUuids(deployment))
		.map(uuid => buildResolvedCrewRecord(deployment, uuid))
		.sort(compareCrewRecords);
}

export function buildAvailableStarshipCrewChoices(starship) {
	if ( !globalThis.game?.actors ) return [];
	return game.actors.contents
		.filter(actor => isDeployableCrewActor(actor) && (actor.id !== starship.id))
		.map(actor => {
			const deploymentFlag = getCrewDeploymentFlag(actor);
			const assignedShip = deploymentFlag?.starshipUuid ? resolveActorDocument(deploymentFlag.starshipUuid) : null;
			return {
				uuid: actor.uuid,
				name: actor.name,
				img: actor.img,
				type: actor.type,
				assignedElsewhere: Boolean(deploymentFlag?.starshipUuid && (deploymentFlag.starshipUuid !== starship.uuid)),
				assignedShipName: assignedShip?.name ?? deploymentFlag?.starshipName ?? "",
				roles: Array.isArray(deploymentFlag?.roles) ? deploymentFlag.roles : []
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));
}

export async function undeployStarshipCrew(starshipSubject, crewSubject, roles = STARSHIP_DEPLOYMENT_ROLES) {
	const starship = resolveActorDocument(starshipSubject);
	const crewActor = resolveActorDocument(crewSubject);
	if ( !isStarshipCharacterActor(starship) || !isDeployableCrewActor(crewActor) ) return false;

	const roleSet = new Set(Array.isArray(roles) ? roles : [roles]);
	const deployment = cloneStarshipDeployment(starship);
	const crewUuid = crewActor.uuid;

	if ( roleSet.has("pilot") && (deployment.pilot.value === crewUuid) ) {
		deployment.pilot.value = null;
	}
	if ( roleSet.has("crew") ) deployment.crew.items.delete(crewUuid);
	if ( roleSet.has("passenger") ) deployment.passenger.items.delete(crewUuid);

	await starship.update(buildDeploymentUpdateData(deployment));
	await updateCrewDeploymentFlag(crewActor, starship, getDeploymentRolesForUuid(deployment, crewUuid));
	return true;
}

export async function deployStarshipCrew(starshipSubject, crewSubject, role) {
	const starship = resolveActorDocument(starshipSubject);
	const crewActor = resolveActorDocument(crewSubject);
	if ( !isStarshipCharacterActor(starship) || !isDeployableCrewActor(crewActor) ) return false;
	if ( !STARSHIP_DEPLOYMENT_ROLES.includes(role) ) throw new Error(`Unsupported crew deployment role: ${role}`);

	const priorAssignment = getCrewDeploymentFlag(crewActor);
	if ( priorAssignment?.starshipUuid && (priorAssignment.starshipUuid !== starship.uuid) ) {
		const previousStarship = resolveActorDocument(priorAssignment.starshipUuid);
		if ( previousStarship ) await undeployStarshipCrew(previousStarship, crewActor);
		else await updateCrewDeploymentFlag(crewActor, starship, []);
	}

	const deployment = cloneStarshipDeployment(starship);
	const crewUuid = crewActor.uuid;
	const displacedPilotUuid = (role === "pilot" && deployment.pilot.value && (deployment.pilot.value !== crewUuid))
		? deployment.pilot.value
		: null;

	if ( role === "pilot" ) deployment.pilot.value = crewUuid;
	if ( role === "crew" || role === "pilot" ) deployment.crew.items.add(crewUuid);
	if ( role === "passenger" ) deployment.passenger.items.add(crewUuid);

	await starship.update(buildDeploymentUpdateData(deployment));
	await updateCrewDeploymentFlag(crewActor, starship, getDeploymentRolesForUuid(deployment, crewUuid));

	if ( displacedPilotUuid && (displacedPilotUuid !== crewUuid) ) {
		const displacedPilot = resolveActorDocument(displacedPilotUuid);
		if ( displacedPilot ) {
			await updateCrewDeploymentFlag(displacedPilot, starship, getDeploymentRolesForUuid(deployment, displacedPilotUuid));
		}
	}
	return true;
}

export async function toggleStarshipActiveCrew(starshipSubject, crewSubject = null) {
	const starship = resolveActorDocument(starshipSubject);
	if ( !isStarshipCharacterActor(starship) ) return false;

	const deployment = cloneStarshipDeployment(starship);
	const crewActor = resolveActorDocument(crewSubject);
	const targetUuid = crewActor?.uuid ?? (typeof crewSubject === "string" ? crewSubject : null);
	const nextActive = (targetUuid && (deployment.active.value === targetUuid)) ? null : targetUuid;

	if ( nextActive && !collectDeploymentUuids(deployment).has(nextActive) ) return false;
	deployment.active.value = nextActive;
	await starship.update(buildDeploymentUpdateData(deployment));
	return true;
}

export function buildStarshipRuntime(actor) {
	if ( !isStarshipCharacterActor(actor) ) return null;

	const starship = getStarshipCharacterFlag(actor) ?? {};
	const preservedResources = starship.resources ?? {};
	const existingAttributes = actor.system?.attributes ?? {};
	const sourceAttributes = actor.system?._source?.attributes ?? {};
	const sourceTraits = actor.system?._source?.traits ?? {};
	const classification = getStarshipClassificationData(actor) ?? {};
	const sizeData = classification.raw ?? classification;
	const tiers = toNumber(classification.tier ?? starship.details?.tier, 0);
	const hugeOrGrg = ["huge", "grg"].includes(classification.size);
	const tierStep = hugeOrGrg ? 2 : 1;

	const armorItem = getEquippedStarshipItem(actor, "starship");
	const hyperdriveItem = getEquippedStarshipItem(actor, "hyper");
	const powerCouplingItem = getEquippedStarshipItem(actor, "powerc");
	const reactorItem = getEquippedStarshipItem(actor, "reactor");
	const shieldItem = getEquippedStarshipItem(actor, "ssshield");

	const armorData = armorItem?.system ?? {};
	const hyperdriveData = hyperdriveItem?.system ?? {};
	const powerCouplingData = powerCouplingItem?.system ?? {};
	const reactorData = reactorItem?.system ?? {};
	const shieldData = shieldItem?.system ?? {};

	const hullDiceMax = coalesceNumber(
		sourceAttributes?.hull?.dicemax,
		sizeData.hullDiceStart + (tierStep * tiers),
		existingAttributes?.hull?.dicemax,
		preservedResources?.hullDice?.dicemax
	);
	const hullDiceCurrent = Math.max(0, coalesceNumber(
		sourceAttributes?.hull?.dice,
		hullDiceMax - toNumber(sizeData.hullDiceUsed, 0),
		existingAttributes?.hull?.dice,
		preservedResources?.hullDice?.dice
	));

	const shieldDiceMax = coalesceNumber(
		sourceAttributes?.shld?.dicemax,
		sizeData.shldDiceStart + (tierStep * tiers),
		existingAttributes?.shld?.dicemax,
		preservedResources?.shieldDice?.dicemax
	);
	const shieldDiceCurrent = Math.max(0, coalesceNumber(
		sourceAttributes?.shld?.dice,
		shieldDiceMax - toNumber(sizeData.shldDiceUsed, 0),
		existingAttributes?.shld?.dice,
		preservedResources?.shieldDice?.dice
	));

	const deployment = getDeploymentState(sourceAttributes?.deployment ?? existingAttributes?.deployment, preservedResources?.deployment);
	syncDeploymentActiveFlags(deployment);
	const activeUuid = deployment.active.value;
	const activeActor = activeUuid ? fromUuidSync(activeUuid) : null;
	const pilotActor = deployment.pilot.value ? fromUuidSync(deployment.pilot.value) : null;
	const proficiency = activeActor?.system?.details?.ranks
		? coalesceNumber(activeActor.system?.attributes?.prof, sourceAttributes?.prof, existingAttributes?.prof, 0)
		: coalesceNumber(sourceAttributes?.prof, existingAttributes?.prof, 0);
	const crewRoster = buildResolvedCrewRoster(deployment);
	const crewActions = buildResolvedCrewActions(deployment);

	const powerCouplingCentralCap = coalesceNumber(
		powerCouplingData.attributes?.cscap?.value,
		sourceAttributes?.equip?.powerCoupling?.centralCap,
		existingAttributes?.equip?.powerCoupling?.centralCap,
		0
	);
	const powerCouplingSystemCap = coalesceNumber(
		powerCouplingData.attributes?.sscap?.value,
		sourceAttributes?.equip?.powerCoupling?.systemCap,
		existingAttributes?.equip?.powerCoupling?.systemCap,
		0
	);

	const power = {
		routing: sourceAttributes?.power?.routing ?? existingAttributes?.power?.routing ?? preservedResources?.power?.routing ?? "none",
		die: sourceAttributes?.power?.die ?? existingAttributes?.power?.die ?? POWER_DIE_TYPES[tiers] ?? "d1"
	};
	for (const zone of STARSHIP_POWER_ZONES) {
		const derivedMax = (zone === "central") ? powerCouplingCentralCap : powerCouplingSystemCap;
		power[zone] = {
			value: coalesceNumber(sourceAttributes?.power?.[zone]?.value, existingAttributes?.power?.[zone]?.value, preservedResources?.power?.[zone]?.value, 0),
			max: coalesceNumber(sourceAttributes?.power?.[zone]?.max, derivedMax, existingAttributes?.power?.[zone]?.max, preservedResources?.power?.[zone]?.max, 0)
		};
	}

	return {
		classification: {
			name: classification.name ?? actor.name,
			size: classification.size ?? sourceTraits?.size ?? actor.system?.traits?.size ?? "med",
			tier: tiers,
			identifier: classification.identifier ?? ""
		},
		attributes: {
			prof: proficiency,
			systemDamage: coalesceNumber(sourceAttributes?.systemDamage, existingAttributes?.systemDamage, preservedResources?.systemDamage, 0),
			deployment,
			fuel: {
				value: coalesceNumber(sourceAttributes?.fuel?.value, existingAttributes?.fuel?.value, preservedResources?.fuel?.value, 0),
				cost: coalesceNumber(sourceAttributes?.fuel?.cost, sizeData.fuelCost, existingAttributes?.fuel?.cost, preservedResources?.fuel?.cost, 0),
				fuelCap: coalesceNumber(sourceAttributes?.fuel?.fuelCap, sizeData.fuelCap, existingAttributes?.fuel?.fuelCap, preservedResources?.fuel?.fuelCap, 0)
			},
			hull: {
				die: sourceAttributes?.hull?.die ?? existingAttributes?.hull?.die ?? sizeData.hullDice ?? preservedResources?.hullDice?.die ?? "d1",
				dicemax: hullDiceMax,
				dice: hullDiceCurrent
			},
			shld: {
				die: sourceAttributes?.shld?.die ?? existingAttributes?.shld?.die ?? sizeData.shldDice ?? preservedResources?.shieldDice?.die ?? "d1",
				dicemax: shieldDiceMax,
				dice: shieldDiceCurrent
			},
			cost: {
				baseBuild: coalesceNumber(sourceAttributes?.cost?.baseBuild, sizeData.buildBaseCost, preservedResources?.cost?.baseBuild, 0),
				baseUpgrade: coalesceNumber(sourceAttributes?.cost?.baseUpgrade, SS_BASE_UPGRADE_COST[tiers], preservedResources?.cost?.baseUpgrade, 0),
				multEquip: coalesceNumber(sourceAttributes?.cost?.multEquip, sizeData.equipCostMult, preservedResources?.cost?.multEquip, 1),
				multModification: coalesceNumber(sourceAttributes?.cost?.multModification, sizeData.modCostMult, preservedResources?.cost?.multModification, 1),
				multUpgrade: coalesceNumber(sourceAttributes?.cost?.multUpgrade, sizeData.upgrdCostMult, preservedResources?.cost?.multUpgrade, 1)
			},
			mods: {
				cap: { max: coalesceNumber(sourceAttributes?.mods?.cap?.max, sizeData.modBaseCap, existingAttributes?.mods?.cap?.max, 0) },
				suite: { max: coalesceNumber(sourceAttributes?.mods?.suite?.max, sizeData.modMaxSuitesBase, existingAttributes?.mods?.suite?.max, 0) },
				hardpoint: { max: coalesceNumber(sourceAttributes?.mods?.hardpoint?.max, existingAttributes?.mods?.hardpoint?.max, 0) }
			},
			workforce: {
				minBuild: coalesceNumber(sourceAttributes?.workforce?.minBuild, sizeData.buildMinWorkforce, existingAttributes?.workforce?.minBuild, 0),
				minEquip: coalesceNumber(sourceAttributes?.workforce?.minEquip, sizeData.equipMinWorkforce, existingAttributes?.workforce?.minEquip, 0),
				minModification: coalesceNumber(sourceAttributes?.workforce?.minModification, sizeData.modMinWorkforce, existingAttributes?.workforce?.minModification, 0),
				minUpgrade: coalesceNumber(sourceAttributes?.workforce?.minUpgrade, sizeData.upgrdMinWorkforce, existingAttributes?.workforce?.minUpgrade, 0),
				max: coalesceNumber(
					sourceAttributes?.workforce?.max,
					coalesceNumber(sizeData.buildMinWorkforce, 0) * 5,
					existingAttributes?.workforce?.max,
					0
				)
			},
			equip: {
				size: {
					cargoCap: coalesceNumber(sourceAttributes?.equip?.size?.cargoCap, sizeData.cargoCap, existingAttributes?.equip?.size?.cargoCap, 0),
					crewMinWorkforce: coalesceNumber(sourceAttributes?.equip?.size?.crewMinWorkforce, sizeData.crewMinWorkforce, existingAttributes?.equip?.size?.crewMinWorkforce, 1),
					foodCap: coalesceNumber(sourceAttributes?.equip?.size?.foodCap, sizeData.foodCap, existingAttributes?.equip?.size?.foodCap, 0)
				},
				armor: {
					dr: coalesceNumber(armorData.attributes?.dmgred?.value, sourceAttributes?.equip?.armor?.dr, existingAttributes?.equip?.armor?.dr, 0),
					maxDex: coalesceNumber(armorData.armor?.dex, sourceAttributes?.equip?.armor?.maxDex, existingAttributes?.equip?.armor?.maxDex, 99),
					stealthDisadv: Boolean(armorData.stealth ?? sourceAttributes?.equip?.armor?.stealthDisadv ?? existingAttributes?.equip?.armor?.stealthDisadv)
				},
				hyperdrive: {
					class: coalesceNumber(hyperdriveData.attributes?.hdclass?.value, sourceAttributes?.equip?.hyperdrive?.class, existingAttributes?.equip?.hyperdrive?.class, 0)
				},
				powerCoupling: {
					centralCap: powerCouplingCentralCap,
					systemCap: powerCouplingSystemCap
				},
				reactor: {
					fuelMult: coalesceNumber(reactorData.attributes?.fuelcostsmod?.value, sourceAttributes?.equip?.reactor?.fuelMult, existingAttributes?.equip?.reactor?.fuelMult, 1),
					powerRecDie: reactorData.attributes?.powerdicerec?.value
						?? sourceAttributes?.equip?.reactor?.powerRecDie
						?? existingAttributes?.equip?.reactor?.powerRecDie
						?? "1d1"
				},
				shields: {
					capMult: coalesceNumber(shieldData.attributes?.capx?.value, sourceAttributes?.equip?.shields?.capMult, existingAttributes?.equip?.shields?.capMult, 0),
					regenRateMult: coalesceNumber(shieldData.attributes?.regrateco?.value, sourceAttributes?.equip?.shields?.regenRateMult, existingAttributes?.equip?.shields?.regenRateMult, 0)
				}
			},
			power,
			crewSummary: {
				pilotAssigned: Boolean(deployment.pilot.value),
				crewCount: countCollection(deployment.crew),
				passengerCount: countCollection(deployment.passenger),
				activeUuid,
				pilotSkill: coalesceNumber(pilotActor?.system?.skills?.pil?.value, 0)
			}
		},
		crew: {
			roster: crewRoster,
			actions: crewActions
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

export function getStarshipTier(subject) {
	const flag = getStarshipCharacterFlag(subject);
	return toNumber(flag?.classification?.tier ?? flag?.details?.tier ?? subject?.system?.details?.tier, 0);
}

export function buildStarshipSkillEntries(subject) {
	const flag = getStarshipCharacterFlag(subject);
	const runtime = buildStarshipRuntime(subject);
	const skillConfig = CONFIG.DND5E.starshipSkills ?? {};
	const legacySkills = flag?.skills ?? {};
	const abilities = flag?.abilities ?? {};
	const proficiency = toNumber(subject?.system?.attributes?.prof ?? runtime?.attributes?.prof ?? flag?.legacySystem?.attributes?.prof, 0);
	const pilotSkill = toNumber(runtime?.attributes?.crewSummary?.pilotSkill, 0);

	return Object.entries(skillConfig).map(([key, config]) => {
		const legacySkill = legacySkills[key] ?? {};
		const abilityKey = legacySkill.ability ?? config.ability ?? "int";
		const abilityScore = toNumber(abilities[abilityKey]?.value, 10);
		const abilityMod = Math.floor((abilityScore - 10) / 2);
		const proficiencyMultiplier = toNumber(legacySkill.value, 0);
		let total = abilityMod + (proficiency * proficiencyMultiplier);
		if ( key === "man" ) total = Math.max(total, pilotSkill);
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
