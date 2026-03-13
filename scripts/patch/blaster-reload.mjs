const SUPPORTED_AMMO_TYPES = new Set(["powerCell", "cartridge"]);
const RELOAD_BUTTON_CLASS = "sw5e-module-blaster-reload";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function getAmmoTypes(itemData) {
	const types = itemData?.system?.ammo?.types;
	if ( Array.isArray(types) && types.length ) return types;
	const legacyTypes = itemData?.flags?.sw5e?.reload?.types;
	return Array.isArray(legacyTypes) ? legacyTypes : [];
}

function getReloadMax(itemData) {
	const ammoMax = Number(itemData?.system?.ammo?.max);
	if ( Number.isFinite(ammoMax) && (ammoMax > 0) ) return ammoMax;

	const systemRel = Number(itemData?.system?.properties?.rel ?? itemData?.system?.properties?.ovr);
	if ( Number.isFinite(systemRel) && (systemRel > 0) ) return systemRel;

	const flagRel = Number(
		itemData?.flags?.sw5e?.properties?.rel
		?? itemData?.flags?.sw5e?.properties?.reload
		?? itemData?.flags?.sw5e?.properties?.ovr
	);
	return Number.isFinite(flagRel) && (flagRel > 0) ? flagRel : 0;
}

function getReloadValue(itemData) {
	const value = Number(itemData?.system?.ammo?.value);
	return Number.isFinite(value) ? value : 0;
}

function getInitialAmmoValueUpdate(itemData) {
	if ( itemData?.type !== "weapon" ) return null;
	if ( !getAmmoTypes(itemData).some(type => SUPPORTED_AMMO_TYPES.has(type)) ) return null;
	if ( ![null, undefined, ""].includes(itemData?.system?.ammo?.value) ) return null;

	const reloadMax = getReloadMax(itemData);
	if ( reloadMax <= 0 ) return null;
	return { "system.ammo.value": reloadMax };
}

function isManagedBlasterWeapon(item) {
	if ( item?.type !== "weapon" ) return false;
	if ( !item?.system?.ammo ) return false;
	if ( getReloadMax(item) <= 0 ) return false;
	return getAmmoTypes(item).some(type => SUPPORTED_AMMO_TYPES.has(type));
}

function getCompatibleAmmo(weapon) {
	const actor = weapon?.actor;
	if ( !actor ) return [];

	const validTypes = new Set(getAmmoTypes(weapon).filter(type => SUPPORTED_AMMO_TYPES.has(type)));
	if ( !validTypes.size ) return [];

	return actor.items.filter(item => {
		if ( item.type !== "consumable" ) return false;
		if ( item.system?.consumableType !== "ammo" ) return false;
		return validTypes.has(item.system?.ammoType);
	});
}

function getAmmoQuantity(item) {
	const quantity = Number(item?.system?.quantity);
	return Number.isFinite(quantity) ? quantity : 0;
}

function getAmmoLabel(weapon) {
	const labels = [];
	const types = new Set(getAmmoTypes(weapon).filter(type => SUPPORTED_AMMO_TYPES.has(type)));
	if ( types.has("powerCell") ) labels.push("power cells");
	if ( types.has("cartridge") ) labels.push("slug cartridges");
	return labels.join(" or ") || "ammo";
}

async function resolveAmmoTarget(weapon) {
	const compatibleAmmo = getCompatibleAmmo(weapon);
	if ( !compatibleAmmo.length ) return { reason: "missing" };

	const currentTarget = weapon.system?.ammo?.target;
	const currentAmmo = compatibleAmmo.find(item => item.id === currentTarget);
	if ( currentAmmo && (getAmmoQuantity(currentAmmo) > 0) ) return { ammo: currentAmmo };

	const availableAmmo = compatibleAmmo.filter(item => getAmmoQuantity(item) > 0);
	if ( !availableAmmo.length ) return { reason: "empty" };

	const nextAmmo = availableAmmo[0];
	if ( nextAmmo.id !== currentTarget ) {
		await weapon.update({ "system.ammo.target": nextAmmo.id });
		return { ammo: weapon.actor?.items?.get(nextAmmo.id) ?? nextAmmo };
	}

	return { ammo: nextAmmo };
}

function warnReloadUnavailable(weapon, reason) {
	const label = getAmmoLabel(weapon);
	const name = weapon?.name ?? game.i18n.localize("SW5E.WeaponReload");
	const message = reason === "empty"
		? `No ${label} remaining to reload ${name}.`
		: `No ${label} available to reload ${name}.`;
	ui.notifications.warn(message);
}

async function onReloadButtonClick(app, event) {
	event.preventDefault();
	event.stopPropagation();

	const row = event.currentTarget.closest(".item[data-item-id]");
	const weapon = app.actor?.items?.get(row?.dataset?.itemId);
	if ( !isManagedBlasterWeapon(weapon) ) return;

	const reloadMax = getReloadMax(weapon);
	if ( getReloadValue(weapon) >= reloadMax ) return;

	const resolvedAmmo = await resolveAmmoTarget(weapon);
	if ( !resolvedAmmo.ammo ) {
		warnReloadUnavailable(weapon, resolvedAmmo.reason);
		return;
	}

	const activeWeapon = app.actor?.items?.get(weapon.id) ?? weapon;
	activeWeapon.reloadWeapon();
}

function createReloadButton(app) {
	const button = document.createElement("a");
	button.className = `item-control ${RELOAD_BUTTON_CLASS}`;
	button.dataset.action = "itemReload";
	button.dataset.tooltip = game.i18n.localize("SW5E.WeaponReload");
	button.setAttribute("aria-label", game.i18n.localize("SW5E.WeaponReload"));
	button.innerHTML = `<i class="fas fa-rotate-right"></i>`;
	button.addEventListener("click", onReloadButtonClick.bind(null, app));
	return button;
}

function renderReloadButtons(app, html) {
	const root = getHtmlRoot(html);
	if ( !root || !app?.actor?.isOwner || (app.actor.type !== "character") ) return;

	root.querySelectorAll(`.${RELOAD_BUTTON_CLASS}`).forEach(button => button.remove());

	for ( const row of root.querySelectorAll(".item[data-item-id]") ) {
		const weapon = app.actor.items.get(row.dataset.itemId);
		if ( !isManagedBlasterWeapon(weapon) ) continue;

		const controls = row.querySelector(".item-controls");
		if ( !controls ) continue;

		const button = createReloadButton(app);
		controls.insertBefore(button, controls.firstChild);
	}
}

export function patchBlasterReload() {
	Hooks.on("preCreateItem", (document, data) => {
		if ( document?.parent?.documentName !== "Actor" ) return;
		const updates = getInitialAmmoValueUpdate(data);
		if ( updates ) document.updateSource(updates);
	});

	Hooks.on("renderActorSheetV2", renderReloadButtons);
}
