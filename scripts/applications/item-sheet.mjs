import { getModulePath } from "../module-support.mjs";

export class ItemSheetSW5E extends globalThis.dnd5e.applications.item.ItemSheet5e {
	/** @inheritdoc */
	get template() {
		return getModulePath(`templates/items/${this.item.type.substring(5)}.hbs`);
	}
}
