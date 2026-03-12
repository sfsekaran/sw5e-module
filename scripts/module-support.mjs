export const HOOKS_NAMESPACE = "sw5e";
export const SETTINGS_NAMESPACE = "sw5e";

const MODULE_ID_CANDIDATES = ["sw5e", "sw5e-module"];
const LEGACY_MODULE_ID = "sw5e";

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
