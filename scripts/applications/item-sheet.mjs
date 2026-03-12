import { getModulePath } from "../module-support.mjs";

export class ItemSheetSW5E extends globalThis.dnd5e.applications.item.ItemSheet5e {
	/** @inheritdoc */
	get template() {
		const itemType = this.item.type?.split(".").at(-1) ?? this.item.type;
		return getModulePath(`templates/items/${itemType}.hbs`);
	}
}
