import { getModuleId } from "../../module-support.mjs";

export function patchKeen() {
	function useKeen(wrapped, ...args) {
		const keen = this.parent?.flags?.sw5e?.properties?.keen ?? 0;
		const result = wrapped(...args);
		return result === Infinity ? Math.max(15, 20 - keen) : result;
	}
	libWrapper.register(getModuleId(), 'dnd5e.dataModels.item.ActivitiesTemplate.prototype.criticalThreshold', useKeen, 'MIXED' );
}
