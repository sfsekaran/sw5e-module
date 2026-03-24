export const TARGET_DND5E_VERSION = "5.2.5"

const LEGACY_ITEM_TYPE_REMAPS = {
	power: "spell",
	species: "race",
	archetype: "subclass",
	modification: "loot"
}

const LEGACY_FEAT_LIKE_ITEM_TYPES = {
	deploymentfeature: { value: "deployment" },
	classfeature: { value: "class" },
	fightingmastery: { value: "customizationOption", subtype: "fightingMastery" },
	fightingstyle: { value: "customizationOption", subtype: "fightingStyle" },
	lightsaberform: { value: "customizationOption", subtype: "lightsaberForm" },
	venture: { value: "deployment", subtype: "venture" }
}

const STANDARD_DND5E_SPELL_SCHOOLS = new Set(["abj", "con", "div", "enc", "evo", "ill", "nec", "trs", "trn"])
const TOOL_TYPE_VALUE_MAP = {
	art: "artisan",
	artisan: "artisan",
	game: "game",
	kit: "specialist",
	music: "music",
	specialist: "specialist"
}

function isObjectLike(value) {
	return !!value && (typeof value === "object") && !Array.isArray(value)
}

function hasOwnKeys(value) {
	return isObjectLike(value) && Object.keys(value).length > 0
}

function normalizeActivityEntry(activity, fallbackId) {
	if ( !isObjectLike(activity) ) return null
	activity._id ??= fallbackId
	return activity
}

function normalizeActivitiesToObject(activities) {
	const normalized = {}
	let index = 0

	for ( const [candidateId, activity] of activities ) {
		index += 1
		const fallbackId = candidateId || `legacy-activity-${index}`
		const entry = normalizeActivityEntry(activity, fallbackId)
		if ( !entry ) continue
		normalized[entry._id ?? fallbackId] = entry
	}

	return normalized
}

function isSw5ePowerData(item) {
	if ( item?.type !== "spell" ) return false
	const school = item?.system?.school
	const powerCasting = globalThis.CONFIG?.DND5E?.powerCasting ?? {}
	if ( school && Object.values(powerCasting).some(castType => school in (castType?.schools ?? {})) ) return true
	if ( school && !STANDARD_DND5E_SPELL_SCHOOLS.has(school) ) return true

	const consumeTarget = item?.system?.consume?.target
	if ( typeof consumeTarget === "string" && /^powercasting\.(force|tech)\.points\.value$/.test(consumeTarget) ) return true

	const activityTargets = Object.values(item?.system?.activities ?? {}).flatMap(activity => activity?.consumption?.targets ?? [])
	return activityTargets.some(target =>
		target?.type === "attribute" && /^powercasting\.(force|tech)\.points\.value$/.test(target?.target ?? "")
	)
}

function normalizePowerCastingDefaults(item) {
	if ( !isSw5ePowerData(item) ) return false
	item.system ??= {}
	let changed = false

	if ( item.system.method !== "powerCasting" ) {
		item.system.method = "powerCasting"
		changed = true
	}

	if ( item.system.prepared !== true ) {
		item.system.prepared = true
		changed = true
	}

	item.system.preparation ??= {}
	if ( item.system.preparation.prepared !== true ) {
		item.system.preparation.prepared = true
		changed = true
	}

	return changed
}

function activityHasMeasuredTemplate(activity) {
	const template = activity?.target?.template
	if ( template === true ) return true
	if ( hasOwnKeys(template) ) return true
	if ( activity?.target?.affects?.type === "area" ) return true
	return false
}

function normalizeLegacyWeaponPromptDefaults(item) {
	if ( item?.type !== "weapon" ) return false
	if ( !hasOwnKeys(item?.system?.activities) ) return false
	if ( Object.values(item.system.activities).some(activityHasMeasuredTemplate) ) return false
	if ( !isObjectLike(item.system.target) || item.system.target.prompt !== true ) return false
	item.system.target.prompt = false
	return true
}

function normalizeLegacyToolShape(item) {
	if ( item?.type !== "tool" ) return false
	item.system ??= {}

	let changed = false
	const sourceType = item.system.type
	const toolType = TOOL_TYPE_VALUE_MAP[sourceType?.value ?? item.system.toolType]
	const baseItem = sourceType?.baseItem ?? item.system.baseItem

	if ( toolType && item.system.toolType !== toolType ) {
		item.system.toolType = toolType
		changed = true
	}

	if ( typeof baseItem === "string" && baseItem && item.system.baseItem !== baseItem ) {
		item.system.baseItem = baseItem
		changed = true
	}

	return changed
}

function normalizeSystemStats(data, { targetSystemVersion=TARGET_DND5E_VERSION }={}) {
	if ( !isObjectLike(data?._stats) ) return false
	let changed = false
	if ( data._stats.systemId === "sw5e" ) {
		data._stats.systemId = "dnd5e"
		changed = true
	}
	if ( data._stats.systemId === "dnd5e" && data._stats.systemVersion !== targetSystemVersion ) {
		data._stats.systemVersion = targetSystemVersion
		changed = true
	}
	return changed
}

export function normalizeLegacyItemActivities(item) {
	if ( !item?.system || !("activities" in item.system) ) return false

	const activities = item.system.activities
	if ( activities === undefined ) return false

	if ( Array.isArray(activities) ) {
		const normalized = normalizeActivitiesToObject(
			activities.map((activity, index) => [activity?._id ?? `legacy-activity-${index + 1}`, activity])
		)
		item.system.activities = normalized
		return true
	}

	if ( !isObjectLike(activities) ) return false

	const normalized = normalizeActivitiesToObject(Object.entries(activities))
	const changed = JSON.stringify(activities) !== JSON.stringify(normalized)
	item.system.activities = normalized
	return changed
}

function normalizeScaleValue(scaleValue, scaleType) {
	if ( !isObjectLike(scaleValue) ) return false

	let changed = false
	if ( scaleType === "dice" ) {
		const number = Number(scaleValue.number ?? scaleValue.n)
		const faces = Number(scaleValue.faces ?? scaleValue.die)

		if ( Number.isFinite(number) && (scaleValue.number === undefined) ) {
			scaleValue.number = number
			changed = true
		}
		if ( Number.isFinite(number) && (scaleValue.n === undefined) ) {
			scaleValue.n = number
			changed = true
		}
		if ( Number.isFinite(faces) && (scaleValue.faces === undefined) ) {
			scaleValue.faces = faces
			changed = true
		}
		if ( Number.isFinite(faces) && (scaleValue.die === undefined) ) {
			scaleValue.die = faces
			changed = true
		}
	} else if ( scaleType === "number" ) {
		const value = Number(scaleValue.value ?? scaleValue.number ?? scaleValue.n)
		if ( Number.isFinite(value) && (scaleValue.value === undefined) ) {
			scaleValue.value = value
			changed = true
		}
	}

	return changed
}

export function normalizeLegacyItemAdvancement(item) {
	if ( !item?.system || !("advancement" in item.system) ) return false

	const rawAdvancement = item.system.advancement
	if ( rawAdvancement === undefined ) return false

	let changed = false
	let advancement = rawAdvancement

	if ( isObjectLike(rawAdvancement) ) {
		advancement = Object.values(rawAdvancement)
		item.system.advancement = advancement
		changed = true
	}

	if ( !Array.isArray(advancement) ) return changed

	const normalized = advancement.filter(adv => isObjectLike(adv))
	if ( normalized.length !== advancement.length ) {
		item.system.advancement = normalized
		advancement = normalized
		changed = true
	}

	for ( const adv of advancement ) {
		if ( !isObjectLike(adv) ) continue
		if ( !isObjectLike(adv.configuration) ) {
			adv.configuration = {}
			changed = true
		}
		if ( adv.value === undefined ) {
			adv.value = {}
			changed = true
		}

		const scale = adv.configuration.scale
		if ( !isObjectLike(scale) ) continue
		for ( const value of Object.values(scale) ) {
			changed = normalizeScaleValue(value, adv.configuration.type) || changed
		}
	}

	return changed
}

export function normalizeDnd5eItemSource(item, { targetSystemVersion=TARGET_DND5E_VERSION }={}) {
	if ( !item?.system ) return false

	let changed = false
	changed = normalizeLegacyItemActivities(item) || changed
	changed = normalizeLegacyItemAdvancement(item) || changed
	changed = normalizeLegacyToolShape(item) || changed
	changed = normalizeLegacyWeaponPromptDefaults(item) || changed
	changed = normalizePowerCastingDefaults(item) || changed

	if ( changed ) changed = normalizeSystemStats(item, { targetSystemVersion }) || changed

	return changed
}

export function normalizeEmbeddedDnd5eItemSources(items=[]) {
	let changed = false
	for ( const item of items ) changed = normalizeDnd5eItemSource(item) || changed
	return changed
}

export function normalizeLegacyMasterItemSource(item) {
	if ( !item || (typeof item !== "object") ) return false

	let changed = false
	changed = normalizeSystemStats(item) || changed

	if ( typeof item.type === "string" ) {
		const normalizedType = item.type.split(".").at(-1) ?? item.type
		const remappedType = LEGACY_ITEM_TYPE_REMAPS[normalizedType]
		const legacyFeatLike = LEGACY_FEAT_LIKE_ITEM_TYPES[normalizedType]
		if ( remappedType && remappedType !== item.type ) {
			item.type = remappedType
			changed = true
		} else if ( legacyFeatLike ) {
			item.type = "feat"
			item.system ??= {}
			item.system.description ??= { value: "", chat: "" }
			item.system.source ??= {}
			item.system.advancement ??= []
			item.system.type ??= {}
			item.system.type.value = legacyFeatLike.value
			item.system.type.subtype = legacyFeatLike.subtype ?? ""
			changed = true
		} else if ( ["maneuver", "sw5e.maneuver"].includes(item.type) || normalizedType === "maneuver" ) {
			item.type = "sw5e-module.maneuver"
			changed = true
		}
	}

	if ( item.system?.price?.denomination === "gc" ) {
		item.system.price.denomination = "gp"
		changed = true
	}
	if ( item.system?.save?.scaling === "power" ) {
		item.system.save.scaling = "spell"
		changed = true
	}
	if ( Array.isArray(item.changes) ) {
		for ( const change of item.changes ) {
			if ( change?.key !== "system.traits.languages.value" ) continue
			if ( change.value === "basic" ) {
				change.value = "common"
				changed = true
			}
		}
	}

	return changed
}

export function normalizeEmbeddedLegacyMasterItemSources(items=[]) {
	let changed = false
	for ( const item of items ) changed = normalizeLegacyMasterItemSource(item) || changed
	return changed
}

export function normalizeLegacyMasterActorSource(actor) {
	if ( !actor || (typeof actor !== "object") ) return false

	let changed = false
	changed = normalizeSystemStats(actor) || changed

	const details = actor.system?.details
	if ( isObjectLike(details) ) {
		for ( const key of ["background", "species", "originalClass"] ) {
			const value = details[key]
			if ( !isObjectLike(value) ) continue
			const id = value._id ?? value.id ?? value.uuid ?? null
			if ( !id ) continue
			details[key] = id
			changed = true
		}
	}

	return changed
}
