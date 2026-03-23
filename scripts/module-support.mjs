export const HOOKS_NAMESPACE = "sw5e";
export const SETTINGS_NAMESPACE = "sw5e";

const LEGACY_MODULE_ID = "sw5e";
const TEST_MODULE_ID = "sw5e-module-test";
export const CANONICAL_MODULE_ID = "sw5e-module";
const MODULE_ID_CANDIDATES = [CANONICAL_MODULE_ID, LEGACY_MODULE_ID];
const COMPENDIUM_MODULE_ID_CANDIDATES = [CANONICAL_MODULE_ID, LEGACY_MODULE_ID, TEST_MODULE_ID];

function escapeRegex(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getModuleId() {
	const fromUrl = import.meta.url.match(/\/modules\/([^/]+)\//)?.[1];
	if ( fromUrl ) return fromUrl;
	const module = game?.modules?.find?.(m => MODULE_ID_CANDIDATES.includes(m.id) || m.title === "SW5E");
	return module?.id ?? MODULE_ID_CANDIDATES[0];
}

export function getModule() {
	const moduleId = getModuleId();
	return game?.modules?.get?.(moduleId)
		?? MODULE_ID_CANDIDATES.map(id => game?.modules?.get?.(id)).find(Boolean)
		?? null;
}

export function getModulePath(path="") {
	const basePath = `modules/${getModuleId()}`;
	return path ? `${basePath}/${path}` : basePath;
}

export function getModuleType(subtype) {
	return `${getModuleId()}.${subtype}`;
}

export function getLegacyModuleType(subtype) {
	return `${LEGACY_MODULE_ID}.${subtype}`;
}

export function getModuleTypeCandidates(subtype) {
	return Array.from(new Set([
		getModuleType(subtype),
		getLegacyModuleType(subtype)
	]));
}

export function isModuleType(type, subtype) {
	return getModuleTypeCandidates(subtype).includes(type);
}

export function normalizeModuleType(type, subtype) {
	if ( !isModuleType(type, subtype) ) return type;
	return getModuleType(subtype);
}

export function normalizeCompendiumUuid(uuid, { moduleId=getModuleId() }={}) {
	if ( typeof uuid !== "string" ) return uuid;
	const moduleIds = COMPENDIUM_MODULE_ID_CANDIDATES.map(escapeRegex).join("|");
	return uuid.replace(new RegExp(`^Compendium\\.(${moduleIds})\\.`), `Compendium.${moduleId}.`);
}

export function normalizeCompendiumReferences(text, { moduleId=getModuleId() }={}) {
	if ( typeof text !== "string" ) return text;
	const moduleIds = COMPENDIUM_MODULE_ID_CANDIDATES.map(escapeRegex).join("|");
	return text.replace(new RegExp(`Compendium\\.(${moduleIds})\\.`, "g"), `Compendium.${moduleId}.`);
}
