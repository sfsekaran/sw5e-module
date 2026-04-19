import { getFlag } from "../utils.mjs";

import { patchKeen } from "./properties/keen.mjs";
import { patchReload } from "./properties/reload.mjs";

function addHelper() {
	const ItemDataModel = dnd5e.dataModels.abstract?.ItemDataModel;
	if ( !ItemDataModel ) return;
	ItemDataModel.prototype.getProperty = function (prop) {
		return getFlag(this?.parent, `properties.${prop}`);
	};
}

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

/** Child-index path from `ancestor` to `el` (stable across rerender when DOM shape matches). */
function indexPathFromAncestor(ancestor, el) {
	const idxs = [];
	let cur = el;
	while ( cur && cur !== ancestor ) {
		const p = cur.parentElement;
		if ( !p ) return null;
		idxs.unshift([...p.children].indexOf(cur));
		cur = p;
	}
	return cur === ancestor ? idxs : null;
}

function elementFromIndexPath(ancestor, idxs) {
	let cur = ancestor;
	for ( const i of idxs ) {
		cur = cur.children[i];
		if ( !cur ) return null;
	}
	return cur;
}

/**
 * dnd5e ItemSheet5e (V2) marks parts `scrollable`; overflow is often on nested nodes, not only `.window-content`.
 * Record every descendant with overflow scroll so rerenders don’t lose the visible offset.
 */
function captureItemSheetScrollSnapshots(root) {
	const snaps = [];
	if ( !root?.children ) return snaps;
	const walk = (el, depth) => {
		for ( const child of el.children ) {
			const sh = child.scrollHeight;
			const ch = child.clientHeight;
			const st = child.scrollTop;
			const sl = child.scrollLeft;
			if ( sh > ch + 2 || st > 0 || sl > 0 ) {
				const path = indexPathFromAncestor(root, child);
				if ( path ) snaps.push({ path, depth, top: st, left: sl });
			}
			walk(child, depth + 1);
		}
	};
	walk(root, 0);
	snaps.sort((a, b) => a.depth - b.depth);
	return snaps;
}

function restoreItemSheetScrollSnapshots(root, snaps) {
	for ( const { path, top, left } of snaps ) {
		const el = elementFromIndexPath(root, path);
		if ( el ) {
			el.scrollTop = top;
			el.scrollLeft = left;
		}
	}
}

/**
 * `item.update` forces a full item sheet rerender. The new DOM paints at scroll 0 (visible “jump”) before our
 * older deferred restore ran — users saw a bounce. Hide the sheet body synchronously in `renderItemSheet5e`,
 * restore scroll while hidden, then reveal on the next animation frame.
 */
function withPreservedItemSheetScroll(app, runUpdate) {
	const root = app.element;
	const snaps = captureItemSheetScrollSnapshots(root);
	const itemUuid = app.item?.uuid;

	if ( itemUuid && app && typeof app === "object" ) app._sw5eNumericPropertyScrollSnaps = snaps;

	const ae = document.activeElement;
	if ( ae && root?.contains(ae) && typeof ae.blur === "function" ) ae.blur();

	const result = runUpdate();

	if ( !itemUuid ) return result;

	Hooks.once("renderItemSheet5e", (renderedApp, _html, _data) => {
		if ( renderedApp?.item?.uuid !== itemUuid ) return;

		const el = renderedApp.element;
		if ( !el ) return;

		const hideTarget = el.querySelector(".window-content") ?? el;
		let safetyId = null;
		const reveal = () => {
			hideTarget.style.removeProperty("visibility");
			if ( renderedApp && typeof renderedApp === "object" ) delete renderedApp._sw5eNumericPropertyScrollSnaps;
			if ( safetyId != null ) globalThis.clearTimeout?.(safetyId);
			safetyId = null;
		};

		safetyId = globalThis.setTimeout?.(() => reveal(), 400);

		hideTarget.style.visibility = "hidden";
		restoreItemSheetScrollSnapshots(el, snaps);
		void hideTarget.offsetHeight;

		requestAnimationFrame(() => {
			restoreItemSheetScrollSnapshots(el, snaps);
			reveal();
		});
	});

	return result;
}

function patchSheet() {
	Hooks.on("renderItemSheet5e", (app, html, data) => {
		if (app.item.type !== "weapon" && app.item.type !== "equipment") return;
		const root = html instanceof HTMLElement ? html : html?.[0] ?? html;
		const tabDetails = root?.querySelector('.tab.details');
		if ( !tabDetails ) return;
		const fieldset = tabDetails.firstElementChild;
		if ( !fieldset ) return;
		const wpDiv = Array.from(fieldset.querySelectorAll('div')).find(div => {
			const label = div.querySelector('label');
			const itemTypeName = capitalize(app.item.type);
			return label && label.textContent.trim() === `${itemTypeName} Properties`;
		});
		if ( !wpDiv ) return;
		const wpLabel = wpDiv.firstElementChild.cloneNode(true);

		const properties = new Set((data.properties?.options ?? []).map(p => p.value));
		const numericProperties = new Set([...properties].filter(key => CONFIG.DND5E.itemProperties[key]?.type === "Number"));
		const boolProperties = new Set([...properties].filter(key => !numericProperties.has(key)));
		const itemProperties = new Set(app.item.system.properties ?? []);

		wpDiv.innerHTML = "";
		{
			wpDiv.setAttribute("class", `form-group stacked checkbox-grid`);
			wpDiv.appendChild(wpLabel);
			const formFields = document.createElement("div");
			formFields.setAttribute("class", `form-fields`);
			wpDiv.appendChild(formFields);
			for (const prop of boolProperties) {
				const config = CONFIG.DND5E.itemProperties[prop];
				const path = `system.properties.${prop}`;
				const value = itemProperties.has(prop);

				const labelNode = document.createElement("label");
				labelNode.setAttribute("class", "checkbox");

				const inputNode = document.createElement("dnd5e-checkbox");
				inputNode.setAttribute("name", path);
				inputNode.setAttribute("tabindex", 0);
				if (value) inputNode.setAttribute("checked", null);
				labelNode.appendChild(inputNode);

				const spanNode = document.createElement("span");
				const textNode = document.createTextNode(config.label);
				spanNode.appendChild(textNode);
				labelNode.appendChild(spanNode);
				formFields.appendChild(labelNode);
			}
		}

		const numericNode = document.createElement("div");
		{
			numericNode.setAttribute("class", `form-group grid checkbox-grid`);
			const formFields = document.createElement("div");
			formFields.setAttribute("class", `form-fields`);
			numericNode.appendChild(formFields);
			for (const prop of numericProperties) {
				const config = CONFIG.DND5E.itemProperties[prop];
				const path = `flags.sw5e.properties.${prop}`;
				const value = foundry.utils.getProperty(app.item, path) ?? config.default;

				const labelNode = document.createElement("label");
				labelNode.setAttribute("class", "number");

				const spanNode = document.createElement("span");
				const textNode = document.createTextNode(config.label);
				spanNode.appendChild(textNode);
				labelNode.appendChild(spanNode);

				const inputNode = document.createElement("input");
				inputNode.setAttribute("type", "text");
				inputNode.setAttribute("name", path);
				inputNode.setAttribute("value", value ?? "");
				inputNode.setAttribute("data-dtype", "Number");
				inputNode.addEventListener("change", () => {
					const trimmed = String(inputNode.value ?? "").trim();
					let flagValue = null;
					if ( trimmed !== "" ) {
						const num = Number(trimmed);
						flagValue = Number.isFinite(num) ? num : null;
					}

					const rawFlag = foundry.utils.getProperty(app.item, path);
					const prevNum = rawFlag == null || rawFlag === "" ? null : Number(rawFlag);
					const prevNorm = Number.isFinite(prevNum) ? prevNum : null;

					const propSet = new Set(app.item.system.properties ?? []);
					const hadMember = propSet.has(prop);
					const shouldHaveMember = flagValue !== null;
					if ( shouldHaveMember ) propSet.add(prop);
					else propSet.delete(prop);

					const membershipChanged = hadMember !== shouldHaveMember;
					const valueChanged = prevNorm !== flagValue;
					if ( !membershipChanged && !valueChanged ) return;

					const payload = { [path]: flagValue };
					if ( membershipChanged ) payload["system.properties"] = Array.from(propSet);

					withPreservedItemSheetScroll(app, () => app.item.update(payload)).catch(err => {
						console.error("SW5E MODULE | Numeric item property update failed.", err);
					});
				});
				labelNode.appendChild(inputNode);
				formFields.appendChild(labelNode);
			}
		}

		wpDiv.insertAdjacentElement("afterend", numericNode);
	});
}

export function patchProperties() {
	addHelper();
	patchSheet();

	// patchReload();
	patchKeen();
}
