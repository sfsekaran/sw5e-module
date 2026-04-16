const WEAPON_PROFICIENCY_ALIASES = Object.freeze({
	"*": "*",
	sbl: "sbl",
	smb: "sbl",
	simpleb: "sbl",
	simplebl: "sbl",
	slw: "slw",
	simplelw: "slw",
	svb: "svb",
	simplev: "svb",
	simplevb: "svb",
	simplevw: "svb",
	mbl: "mbl",
	mrb: "mbl",
	martialb: "mbl",
	martialbl: "mbl",
	mlw: "mlw",
	martiallw: "mlw",
	mvb: "mvb",
	martialv: "mvb",
	martialvb: "mvb",
	martialvw: "mvb",
	ebl: "ebl",
	exb: "ebl",
	exoticb: "ebl",
	exoticbl: "ebl",
	elw: "elw",
	exoticlw: "elw",
	evw: "evw",
	exoticv: "evw",
	exoticvb: "evw",
	exoticvw: "evw"
});

function normalizeWhitespace(value) {
	return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeWeaponProficiencyValue(value) {
	const normalized = normalizeWhitespace(value).toLowerCase();
	if ( !normalized ) return normalized;

	if ( normalized.endsWith(":*") ) {
		const category = normalized.slice(0, -2);
		return `${WEAPON_PROFICIENCY_ALIASES[category] ?? category}:*`;
	}

	if ( normalized in WEAPON_PROFICIENCY_ALIASES ) return WEAPON_PROFICIENCY_ALIASES[normalized];

	// Specific weapon proficiencies align best with item baseItem ids, which are typically
	// lowercase names with spaces removed and punctuation preserved only when it is meaningful.
	return normalized
		.replace(/[’']/g, "")
		.replace(/\s+/g, "");
}

export function normalizeAdvancementGrant(grant) {
	if ( typeof grant !== "string" ) return { grant, changed: false };
	if ( !grant.startsWith("weapon:") ) return { grant, changed: false };
	const normalizedValue = normalizeWeaponProficiencyValue(grant.slice("weapon:".length));
	const normalizedGrant = `weapon:${normalizedValue}`;
	return { grant: normalizedGrant, changed: normalizedGrant !== grant };
}

export function normalizeAdvancementGrants(grants = []) {
	let changed = false;
	const normalized = grants.map(grant => {
		const result = normalizeAdvancementGrant(grant);
		changed ||= result.changed;
		return result.grant;
	});
	return { grants: normalized, changed };
}
