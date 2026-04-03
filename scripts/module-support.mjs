const LEGACY_MODULE_ID = "sw5e";
const TEST_MODULE_ID = "sw5e-module-test";
export const CANONICAL_MODULE_ID = "sw5e-module";
export const HOOKS_NAMESPACE = LEGACY_MODULE_ID;
export const LEGACY_SETTINGS_NAMESPACE = LEGACY_MODULE_ID;
export const SETTINGS_NAMESPACE = CANONICAL_MODULE_ID;
const MODULE_ID_CANDIDATES = [CANONICAL_MODULE_ID, LEGACY_MODULE_ID];
const COMPENDIUM_MODULE_ID_CANDIDATES = [CANONICAL_MODULE_ID, LEGACY_MODULE_ID, TEST_MODULE_ID];

function escapeRegex(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cloneData(data) {
	if ( data === undefined ) return undefined;
	if ( typeof globalThis.structuredClone === "function" ) return globalThis.structuredClone(data);
	return JSON.parse(JSON.stringify(data));
}

function getGame() {
	return globalThis.game ?? null;
}

function getWorldSettingsStorage() {
	return getGame()?.settings?.storage?.get?.("world") ?? null;
}

export function hasStoredWorldSetting(namespace, key) {
	return Boolean(getWorldSettingsStorage()?.get(`${namespace}.${key}`));
}

export function getModuleSettingValue(key, fallback) {
	const game = getGame();
	if ( !game?.settings ) return cloneData(fallback);
	const namespaces = Array.from(new Set([SETTINGS_NAMESPACE, LEGACY_SETTINGS_NAMESPACE]));
	for ( const namespace of namespaces ) {
		if ( !hasStoredWorldSetting(namespace, key) ) continue;
		try {
			return cloneData(game.settings.get(namespace, key));
		} catch {
			const value = getWorldSettingsStorage()?.get(`${namespace}.${key}`)?.value;
			return value ?? cloneData(fallback);
		}
	}

	try {
		return cloneData(game.settings.get(SETTINGS_NAMESPACE, key));
	} catch {
		return cloneData(fallback);
	}
}

export function getModuleId() {
	const fromUrl = import.meta.url.match(/\/modules\/([^/]+)\//)?.[1];
	if ( fromUrl ) return fromUrl;
	const game = getGame();
	const module = game?.modules?.find?.(m => MODULE_ID_CANDIDATES.includes(m.id) || m.title === "SW5E");
	return module?.id ?? MODULE_ID_CANDIDATES[0];
}

export function getModule() {
	const game = getGame();
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
