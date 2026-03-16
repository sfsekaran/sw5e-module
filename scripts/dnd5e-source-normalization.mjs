export const TARGET_DND5E_VERSION = "5.2.5"

const LEGACY_ITEM_TYPE_REMAPS = {
	power: "spell",
	species: "race",
	archetype: "subclass",
	modification: "loot",
	starship: "starshipsize"
}

const LEGACY_FEAT_LIKE_ITEM_TYPES = {
	deploymentfeature: { value: "deployment" },
	classfeature: { value: "class" },
	fightingmastery: { value: "customizationOption", subtype: "fightingMastery" },
	fightingstyle: { value: "customizationOption", subtype: "fightingStyle" },
	lightsaberform: { value: "customizationOption", subtype: "lightsaberForm" },
	starshipaction: { value: "starshipAction" },
	starshipfeature: { value: "starship" },
	venture: { value: "deployment", subtype: "venture" }
}

function isObjectLike(value) {
	return !!value && (typeof value === "object") && !Array.isArray(value)
}

function normalizeActivityEntry(activity, fallbackId) {
	if ( !isObjectLike(activity) ) return null
	activity._id ??= fallbackId
	return activity
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
		let changed = false
		item.system.activities = activities
			.map((activity, index) => {
				const hadId = activity?._id
				const normalized = normalizeActivityEntry(activity, `legacy-activity-${index + 1}`)
				if ( normalized && (!hadId || normalized !== activity) ) changed = true
				if ( !normalized && activity ) changed = true
				return normalized
			})
			.filter(activity => activity)
		return changed
	}

	if ( !isObjectLike(activities) ) return false

	item.system.activities = Object.entries(activities)
		.map(([id, activity], index) => normalizeActivityEntry(activity, id || `legacy-activity-${index + 1}`))
		.filter(activity => activity)
	return true
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
	if ( item.system?.target?.type === "starship" ) {
		item.system.target.type = ""
		changed = true
	}
	if ( item.system?.attributes?.ac?.calc === "starship" ) {
		item.system.attributes.ac.calc = "flat"
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
		for ( const key of ["background", "species", "originalClass", "starshipsize"] ) {
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
