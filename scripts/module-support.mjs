export const HOOKS_NAMESPACE = "sw5e";
export const SETTINGS_NAMESPACE = "sw5e";

const MODULE_ID_CANDIDATES = ["sw5e", "sw5e-module"];

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
