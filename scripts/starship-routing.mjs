const POWER_ROUTE_KEYS = ["engines", "shields", "weapons"];
const POWER_SLOT_KEYS = ["central", "comms", "engines", "sensors", "shields", "weapons"];

function getFiniteNumber(value) {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : null;
}

function clampShieldNumber(value) {
	return Math.max(0, Math.floor(getFiniteNumber(value) ?? 0));
}

function getLegacyRecord(subject) {
	if ( subject?.flags?.sw5e?.legacyStarshipActor?.type === "starship" ) return subject.flags.sw5e.legacyStarshipActor;
	if ( subject?._source?.flags?.sw5e?.legacyStarshipActor?.type === "starship" ) return subject._source.flags.sw5e.legacyStarshipActor;
	return null;
}

function getLiveHitPoints(subject) {
	return subject?.system?.attributes?.hp
		?? subject?._source?.system?.attributes?.hp
		?? {};
}

function getLegacyShieldPool(subject) {
	return getLegacyStarshipSystem(subject).attributes?.hp ?? {};
}

export { POWER_ROUTE_KEYS, POWER_SLOT_KEYS };

export function isSw5eStarshipActor(actor) {
	return actor?.type === "vehicle" && getLegacyRecord(actor)?.type === "starship";
}

export function getLegacyStarshipSystem(subject) {
	return getLegacyRecord(subject)?.system ?? {};
}

export function getLiveShieldState(subject) {
	const hp = getLiveHitPoints(subject);
	return {
		value: getFiniteNumber(hp.temp),
		max: getFiniteNumber(hp.tempmax)
	};
}

export function getLegacyShieldState(subject) {
	const hp = getLegacyShieldPool(subject);
	return {
		value: getFiniteNumber(hp.temp),
		max: getFiniteNumber(hp.tempmax)
	};
}

export function getShieldState(subject) {
	const live = getLiveShieldState(subject);
	const legacy = getLegacyShieldState(subject);
	return {
		value: live.value ?? legacy.value ?? 0,
		max: live.max ?? legacy.max ?? 0
	};
}

export function getStarshipPowerRouting(subject) {
	return getLegacyStarshipSystem(subject).attributes?.power?.routing ?? "none";
}

export function getPowerStationValue(subject, key) {
	const numericValue = Number(getLegacyStarshipSystem(subject).attributes?.power?.[key]?.value);
	return Number.isFinite(numericValue) ? numericValue : 0;
}

export function getPowerRoutingEffectIndex(subjectOrRouting, key) {
	const routing = typeof subjectOrRouting === "string" ? subjectOrRouting : getStarshipPowerRouting(subjectOrRouting);
	if ( routing === key ) return 2;
	if ( routing === "none" ) return 1;
	return 0;
}

export function getPowerRoutingMultiplier(subjectOrRouting, key) {
	const effectIndex = getPowerRoutingEffectIndex(subjectOrRouting, key);
	if ( effectIndex === 2 ) return 2;
	if ( effectIndex === 1 ) return 1;
	return 0.5;
}

export function getShieldDamageMultiplier(subject) {
	const effectIndex = getPowerRoutingEffectIndex(subject, "shields");
	if ( effectIndex === 2 ) return 0.5;
	if ( effectIndex === 1 ) return 1;
	return 2;
}

export function getShieldRegenMultiplier(subject) {
	return getPowerRoutingMultiplier(subject, "shields");
}

export function getSynchronizedShieldUpdate(subject, { value, max }={}) {
	const current = getShieldState(subject);
	const nextMax = clampShieldNumber(max ?? current.max);
	const nextValue = Math.min(clampShieldNumber(value ?? current.value), nextMax);
	return {
		"system.attributes.hp.temp": nextValue,
		"system.attributes.hp.tempmax": nextMax,
		"flags.sw5e.legacyStarshipActor.system.attributes.hp.temp": nextValue,
		"flags.sw5e.legacyStarshipActor.system.attributes.hp.tempmax": nextMax
	};
}

export function syncShieldUpdateChange(actor, changed) {
	if ( !isSw5eStarshipActor(actor) || !changed || (typeof changed !== "object") ) return false;

	const liveValue = foundry.utils.getProperty(changed, "system.attributes.hp.temp");
	const liveMax = foundry.utils.getProperty(changed, "system.attributes.hp.tempmax");
	const legacyValue = foundry.utils.getProperty(changed, "flags.sw5e.legacyStarshipActor.system.attributes.hp.temp");
	const legacyMax = foundry.utils.getProperty(changed, "flags.sw5e.legacyStarshipActor.system.attributes.hp.tempmax");
	const hasLiveChange = (liveValue !== undefined) || (liveMax !== undefined);
	const hasLegacyChange = (legacyValue !== undefined) || (legacyMax !== undefined);
	if ( !hasLiveChange && !hasLegacyChange ) return false;

	const current = getShieldState(actor);
	const nextValue = clampShieldNumber(
		liveValue !== undefined ? liveValue : legacyValue !== undefined ? legacyValue : current.value
	);
	const nextMax = clampShieldNumber(
		liveMax !== undefined ? liveMax : legacyMax !== undefined ? legacyMax : current.max
	);
	const synced = getSynchronizedShieldUpdate(actor, {
		value: Math.min(nextValue, nextMax),
		max: nextMax
	});

	for ( const [path, value] of Object.entries(synced) ) {
		foundry.utils.setProperty(changed, path, value);
	}

	return true;
}

export function isStarshipWeapon(item) {
	if ( item?.type !== "weapon" ) return false;
	if ( !isSw5eStarshipActor(item.actor) ) return false;

	const typeValue = String(item.system?.type?.value ?? "").toLowerCase();
	const sourceId = String(item.flags?.core?.sourceId ?? "").toLowerCase();
	return typeValue.includes("starship")
		|| sourceId.includes(".starshipweapons.")
		|| Object.hasOwn(item.system ?? {}, "firingArc");
}
