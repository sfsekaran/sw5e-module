export const TARGET_DND5E_VERSION = "5.2.5"

function isObjectLike(value) {
	return !!value && (typeof value === "object") && !Array.isArray(value)
}

function normalizeActivityEntry(activity, fallbackId) {
	if ( !isObjectLike(activity) ) return null
	activity._id ??= fallbackId
	return activity
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

	if ( changed && item._stats?.systemId === "dnd5e" && item._stats.systemVersion !== targetSystemVersion ) {
		item._stats.systemVersion = targetSystemVersion
		changed = true
	}

	return changed
}

export function normalizeEmbeddedDnd5eItemSources(items=[]) {
	let changed = false
	for ( const item of items ) changed = normalizeDnd5eItemSource(item) || changed
	return changed
}
