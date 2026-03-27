import { getModulePath } from "../module-support.mjs";
import { getDerivedStarshipRuntime, getLegacyStarshipActorSystem, getStarshipSkillEntries, rollStarshipSkill } from "../starship-data.mjs";

const STARSHIP_PACKS = new Set([
	"starshipactions",
	"starshiparmor",
	"starshipequipment",
	"starshipfeatures",
	"starshipmodifications",
	"starships",
	"starshipweapons",
	"deployments",
	"deploymentfeatures",
	"ventures"
]);

const STARSHIP_TAB_ID = "sw5e-starship";
const STARSHIP_FEATURES_TAB_ID = "sw5e-starship-features";
const STOCK_CARGO_TAB_ID = "cargo";
const CUSTOM_STARSHIP_TAB_IDS = new Set([STARSHIP_TAB_ID, STARSHIP_FEATURES_TAB_ID]);

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function getSheetForm(root, app) {
	return app?.form
		?? (root instanceof HTMLFormElement ? root : root.querySelector("form"));
}

function getPrimaryTabNav(root) {
	return root.querySelector(".sheet-navigation[data-group='primary']")
		?? root.querySelector("[data-application-part='tabs'] .sheet-navigation")
		?? root.querySelector("[data-application-part='tabs'] .tabs")
		?? root.querySelector("nav.tabs[data-group='primary']")
		?? root.querySelector("nav.tabs")
		?? root.querySelector(".tabs[data-group='primary']");
}

function getPrimaryTabPanelParent(root) {
	return root.querySelector(".tab[data-group='primary']")?.parentElement
		?? root.querySelector("#tabs")
		?? root.querySelector(".tab-body")
		?? root.querySelector("[data-application-part='inventory']")?.parentElement
		?? root.querySelector(".sheet-body")
		?? root.querySelector(".window-content")
		?? root;
}

function getTabButton(root, tabId) {
	return getPrimaryTabNav(root)?.querySelector(`[data-tab="${tabId}"]`) ?? null;
}

function getStarshipActiveTab(app) {
	if ( app?._sw5eStarshipActiveTab === true ) return STARSHIP_TAB_ID;
	if ( app?._sw5eStarshipActiveTab === false ) return null;
	return typeof app?._sw5eStarshipActiveTab === "string" ? app._sw5eStarshipActiveTab : null;
}

function setStarshipActiveTab(app, tabId = null) {
	app._sw5eStarshipActiveTab = tabId;
}

function activatePrimaryTab(root, tabId) {
	const nav = getPrimaryTabNav(root);
	if ( nav ) {
		nav.querySelectorAll("[data-tab]").forEach(item => {
			item.classList.toggle("active", item.dataset.tab === tabId);
		});
	}

	root.querySelectorAll(".tab[data-group='primary']").forEach(panel => {
		const isActive = panel.dataset.tab === tabId;
		panel.classList.toggle("active", isActive);
		// Only manage `hidden` on our own custom tabs.
		// Stock dnd5e panels use CSS classes for visibility; setting `hidden` on them
		// prevents dnd5e from showing them again when the user clicks back to cargo/description.
		if ( panel.classList.contains("sw5e-starship-tab") ) {
			panel.hidden = !isActive;
		} else {
			panel.hidden = false;
		}
	});
}

function activateSheetTab(root, app, tabId) {
	if ( CUSTOM_STARSHIP_TAB_IDS.has(tabId) ) {
		setStarshipActiveTab(app, tabId);
		activatePrimaryTab(root, tabId);
		return;
	}

	setStarshipActiveTab(app, null);
	const button = getTabButton(root, tabId);
	if ( button ) {
		button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		if ( !button.classList.contains("active") ) activatePrimaryTab(root, tabId);
		return;
	}

	activatePrimaryTab(root, tabId);
}

function ensureStarshipTabTargets(root) {
	const nav = getPrimaryTabNav(root);
	const panelParent = getPrimaryTabPanelParent(root);
	if ( nav && panelParent ) return { nav, panelParent, integrated: true };

	const mountPoint = root.querySelector(".window-content") ?? root;
	let host = mountPoint.querySelector(".sw5e-starship-tab-host");
	if ( !host ) {
		host = document.createElement("section");
		host.className = "sw5e-starship-tab-host";
		host.innerHTML = `
			<nav class="sheet-navigation tabs sw5e-starship-fallback-nav" data-group="primary"></nav>
			<section class="sw5e-starship-tab-panels"></section>
		`;
		mountPoint.prepend(host);
	}

	return {
		nav: host.querySelector(".sw5e-starship-fallback-nav"),
		panelParent: host.querySelector(".sw5e-starship-tab-panels"),
		integrated: false
	};
}

async function ensureWarningsDialog(root, app, actor) {
	const form = getSheetForm(root, app);
	if ( !form || form.querySelector("dialog.warnings") ) return;

	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-warnings-dialog.hbs"),
		{
			title: localizeOrFallback("DND5E.Warnings", "Warnings"),
			body: localizeOrFallback("DND5E.WarningDetails", "This sheet has one or more warnings from the dnd5e actor preparation step."),
			actorName: actor?.name ?? localizeOrFallback("TYPES.Actor.vehicle", "Vehicle Actor"),
			closeLabel: localizeOrFallback("Close", "Close")
		}
	);

	const dialog = document.createElement("dialog");
	dialog.className = "warnings sw5e-starship-warnings-dialog";
	dialog.innerHTML = rendered;
	form.append(dialog);
}

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized === key ? fallback : localized;
}

function isSw5eStarshipActor(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

function getCompendiumPack(item) {
	const sourceId = item?.flags?.core?.sourceId;
	const match = /^Compendium\.[^.]+\.([^.]+)\./.exec(sourceId ?? "");
	return match?.[1] ?? null;
}

function normalizeSourceLabel(source) {
	if ( typeof source === "string" ) return source && source !== "[object Object]" ? source : "";
	if ( source && typeof source === "object" ) return source.custom ?? source.book ?? source.label ?? "";
	return "";
}

function formatPool(current, max) {
	const currentValue = Number.isFinite(Number(current)) ? Number(current) : null;
	const maxValue = Number.isFinite(Number(max)) ? Number(max) : null;
	if ( currentValue == null && maxValue == null ) return "-";
	if ( maxValue == null ) return `${currentValue ?? 0}`;
	return `${currentValue ?? 0} / ${maxValue}`;
}

function formatMovement(actor, legacySystem) {
	const runtime = getDerivedStarshipRuntime(actor);
	const derivedMovement = runtime.movement;
	const units = derivedMovement.units || actor.system?.attributes?.movement?.units || "ft";
	const space = Number.isFinite(Number(derivedMovement.space)) ? Number(derivedMovement.space) : null;
	const turn = Number.isFinite(Number(derivedMovement.turn)) ? Number(derivedMovement.turn) : null;
	if ( space != null || turn != null ) {
		const notes = [];
		if ( turn != null ) notes.push(`Turn ${turn}`);
		if ( derivedMovement.profileSource ) notes.push(derivedMovement.profileSource);
		return {
			primary: `${space ?? 0} ${units}`,
			secondary: notes.join(" | ")
		};
	}

	const fly = Number.isFinite(Number(actor.system?.attributes?.movement?.fly))
		? Number(actor.system.attributes.movement.fly)
		: null;
	return {
		primary: fly != null ? `${fly} ${units}` : "-",
		secondary: ""
	};
}

function localizeTravelPace(pace) {
	const normalized = String(pace ?? "").trim().toLowerCase();
	if ( normalized === "fast" ) return localizeOrFallback("DND5E.TravelPaceFast", "Fast");
	if ( normalized === "slow" ) return localizeOrFallback("DND5E.TravelPaceSlow", "Slow");
	return localizeOrFallback("DND5E.TravelPaceNormal", "Normal");
}

function formatTravel(actor) {
	const runtime = getDerivedStarshipRuntime(actor);
	return {
		primary: localizeTravelPace(runtime.travel?.pace),
		secondary: `Stealth ${localizeTravelPace(runtime.travel?.stealthPace)}`
	};
}

function formatHyperdrive(actor) {
	const runtime = getDerivedStarshipRuntime(actor);
	const hyperdriveClass = Number(runtime.travel?.hyperdriveClass ?? 0);
	return hyperdriveClass > 0 ? `Class ${hyperdriveClass}` : localizeOrFallback("SW5E.None", "None");
}

function formatPowerSummary(legacySystem) {
	const power = legacySystem.attributes?.power ?? {};
	const central = Number.isFinite(Number(power.central?.value)) ? Number(power.central.value) : 0;
	const engines = Number.isFinite(Number(power.engines?.value)) ? Number(power.engines.value) : 0;
	const shields = Number.isFinite(Number(power.shields?.value)) ? Number(power.shields.value) : 0;
	const weapons = Number.isFinite(Number(power.weapons?.value)) ? Number(power.weapons.value) : 0;
	return `C ${central} | E ${engines} | S ${shields} | W ${weapons}`;
}

function getSizeLabel(actor, legacySystem) {
	const sizeKey = actor.system?.traits?.size ?? legacySystem.traits?.size ?? "";
	return CONFIG.DND5E.actorSizes?.[sizeKey] ?? sizeKey ?? "-";
}

function getDeploymentCounts(legacySystem) {
	const deployment = legacySystem.attributes?.deployment ?? {};
	const crew = Array.isArray(deployment.crew?.items) ? deployment.crew.items : Array.isArray(deployment.crew) ? deployment.crew : [];
	const passenger = Array.isArray(deployment.passenger?.items) ? deployment.passenger.items : Array.isArray(deployment.passenger) ? deployment.passenger : [];
	return {
		pilot: deployment.pilot?.value ?? deployment.pilot ?? "",
		crew: crew.length,
		passenger: passenger.length
	};
}

function makeOverviewCards(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const runtime = getDerivedStarshipRuntime(actor);
	const movement = formatMovement(actor, legacySystem);
	const deployment = {
		...getDeploymentCounts(legacySystem),
		...runtime.crew
	};
	const travel = formatTravel(actor);
	const fuel = legacySystem.attributes?.fuel ?? {};
	const routing = legacySystem.attributes?.power?.routing ?? "none";

	return [
		{
			label: localizeOrFallback("SW5E.Movement", "Movement"),
			value: movement.primary,
			note: movement.secondary || localizeOrFallback("SW5E.MovementSpace", "Space")
		},
		{
			label: localizeOrFallback("DND5E.TravelPace", "Travel Pace"),
			value: travel.primary,
			note: travel.secondary
		},
		{
			label: localizeOrFallback("SW5E.Hyperdrive", "Hyperdrive"),
			value: formatHyperdrive(actor),
			note: runtime.travel?.hyperdriveClass ? localizeOrFallback("SW5E.Hyperspace", "Hyperspace") : localizeOrFallback("SW5E.None", "Not Installed")
		},
		{
			label: localizeOrFallback("SW5E.VehicleCrew", "Crew"),
			value: `${deployment.crewCount ?? deployment.crew ?? 0}`,
			note: deployment.pilotName || deployment.pilot ? `Pilot: ${deployment.pilotName || deployment.pilot}` : "No pilot assigned"
		},
		{
			label: localizeOrFallback("SW5E.Fuel", "Fuel"),
			value: formatPool(fuel.value, fuel.fuelCap),
			note: fuel.cost ? `Cost ${fuel.cost}` : localizeOrFallback("SW5E.PowerDie", "Power")
		},
		{
			label: localizeOrFallback("SW5E.PowerDie", "Routing"),
			value: localizeOrFallback(`SW5E.PowerRouting.${routing}`, routing),
			note: formatPowerSummary(legacySystem)
		}
	];
}

function makeSidebarSummary(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const runtime = getDerivedStarshipRuntime(actor);
	const hp = actor.system?.attributes?.hp ?? {};
	const shields = legacySystem.attributes?.hp ?? {};
	const fuel = legacySystem.attributes?.fuel?.value;
	const routing = legacySystem.attributes?.power?.routing ?? "none";

	return [
		{
			label: localizeOrFallback("SW5E.StarshipTier", "Tier"),
			value: Number.isFinite(Number(legacySystem.details?.tier)) ? `${legacySystem.details.tier}` : "-",
			note: normalizeSourceLabel(legacySystem.details?.source)
		},
		{
			label: localizeOrFallback("SW5E.Size", "Size"),
			value: getSizeLabel(actor, legacySystem),
			note: formatHyperdrive(actor)
		},
		{
			label: localizeOrFallback("SW5E.HullPoints", "Hull Points"),
			value: formatPool(hp.value, hp.max),
			note: localizeOrFallback("SW5E.VehicleCrew", "Vehicle")
		},
		{
			label: localizeOrFallback("SW5E.ShieldPoints", "Shield Points"),
			value: formatPool(shields.temp, shields.tempmax),
			note: formatPowerSummary(legacySystem)
		},
		{
			label: localizeOrFallback("SW5E.Fuel", "Fuel"),
			value: Number.isFinite(Number(fuel)) ? `${fuel}` : "-",
			note: `${localizeOrFallback("DND5E.TravelPace", "Travel Pace")}: ${localizeTravelPace(runtime.travel?.pace)}`
		},
		{
			label: localizeOrFallback("SW5E.PowerDie", "Power Routing"),
			value: localizeOrFallback(`SW5E.PowerRouting.${routing}`, routing),
			note: formatPowerSummary(legacySystem)
		}
	];
}

function getItemMeta(item, actor = null) {
	if ( item.flags?.sw5e?.legacyStarshipSize || item.flags?.sw5e?.starshipCharacter?.role === "classification" ) {
		return localizeOrFallback("SW5E.StarshipTier", "Size Profile");
	}

	if ( item.flags?.sw5e?.legacyStarshipMod || item.flags?.sw5e?.starshipCharacter?.role === "modification" ) {
		return item.system?.type?.subtype ?? "Modification";
	}

	if ( item.system?.type?.subtype ) return item.system.type.subtype;
	const pack = getCompendiumPack(item);
	if ( actor && item.type === "weapon" ) {
		const routingMultiplier = getDerivedStarshipRuntime(actor).routing?.weaponsMultiplier ?? 1;
		if ( routingMultiplier === 2 ) return localizeOrFallback("SW5E.PowerRoutingWeaponsPositive", "Weapons deal double damage");
		if ( routingMultiplier === 0.5 ) return localizeOrFallback("SW5E.PowerRoutingWeaponsNegative", "Ship weapon damage is reduced by half");
	}
	return pack ? pack.replace(/-/g, " ") : "";
}

function makeItemEntry(item, defaultTab = STOCK_CARGO_TAB_ID, actor = null) {
	return {
		id: item.id,
		name: item.name,
		meta: getItemMeta(item, actor),
		img: item.img,
		defaultTab
	};
}

function categorizeStarshipItems(actor) {
	const groups = {
		size: { label: localizeOrFallback("TYPES.Item.starshipsizePl", "Starship Size"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Cargo" },
		actions: { label: localizeOrFallback("SW5E.Feature.StarshipAction.Label", "Starship Actions"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Cargo" },
		roles: { label: localizeOrFallback("SW5E.Feature.Deployment.Label", "Crew Roles"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Cargo" },
		features: { label: localizeOrFallback("SW5E.Feature.Starship.Label", "Starship Features"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Cargo" },
		equipment: { label: localizeOrFallback("SW5E.Equipment", "Equipment"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Cargo" },
		modifications: { label: localizeOrFallback("TYPES.Item.starshipmodPl", "Modifications"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Cargo" },
		weapons: { label: localizeOrFallback("SW5E.Weapon", "Weapons"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Cargo" }
	};

	for ( const item of actor.items ) {
		const pack = getCompendiumPack(item);
		const featType = item.system?.type?.value;
		const role = item.flags?.sw5e?.starshipCharacter?.role;

		if ( item.flags?.sw5e?.legacyStarshipSize || role === "classification" ) groups.size.items.push(item);
		else if ( item.flags?.sw5e?.legacyStarshipMod || role === "modification" || pack === "starshipmodifications" ) groups.modifications.items.push(item);
		else if ( featType === "starshipAction" || pack === "starshipactions" ) groups.actions.items.push(item);
		else if ( featType === "deployment" || role === "deployment" || role === "venture" || pack === "deployments" || pack === "deploymentfeatures" || pack === "ventures" ) groups.roles.items.push(item);
		else if ( featType === "starship" || pack === "starshipfeatures" ) groups.features.items.push(item);
		else if ( pack === "starshipweapons" || item.type === "weapon" ) groups.weapons.items.push(item);
		else if ( pack === "starshiparmor" || pack === "starshipequipment" || item.type === "equipment" ) groups.equipment.items.push(item);
	}

	return groups;
}

function buildGroupContext(group) {
	return {
		label: group.label,
		count: group.items.length,
		defaultTab: group.defaultTab,
		manageLabel: group.manageLabel,
		items: group.items.sort((left, right) => left.name.localeCompare(right.name)).map(item => makeItemEntry(item, group.defaultTab, group.actor))
	};
}

function partitionStarshipGroups(actor) {
	const groups = categorizeStarshipItems(actor);
	for ( const group of Object.values(groups) ) group.actor = actor;
	const workspaceGroups = [groups.size, groups.actions, groups.roles, groups.equipment, groups.modifications, groups.weapons]
		.map(buildGroupContext)
		.filter(group => group.items.length);
	const featureGroups = [groups.features].map(buildGroupContext).filter(group => group.items.length);
	return { workspaceGroups, featureGroups };
}

function getLegacyNotes(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const runtime = getDerivedStarshipRuntime(actor);
	const notes = [];
	if ( legacySystem.attributes?.power?.routing ) notes.push(`Routing: ${legacySystem.attributes.power.routing}`);
	if ( legacySystem.attributes?.systemDamage ) notes.push(`System Damage ${legacySystem.attributes.systemDamage}`);
	if ( runtime.travel?.hyperdriveClass ) notes.push(`Hyperdrive Class ${runtime.travel.hyperdriveClass}`);
	if ( runtime.crew?.activeCrewName ) notes.push(`Active Crew: ${runtime.crew.activeCrewName}`);
	if ( runtime.movement?.enginesMultiplier === 2 ) notes.push(localizeOrFallback("SW5E.PowerRoutingEnginesPositive", "The ship's flying speed is doubled"));
	else if ( runtime.movement?.enginesMultiplier === 0.5 ) notes.push(localizeOrFallback("SW5E.PowerRoutingEnginesNegative", "The ship's flying speed is reduced by half"));
	return notes;
}

function makeHeaderBadges(actor) {
	const runtime = getDerivedStarshipRuntime(actor);
	const deployment = {
		...getDeploymentCounts(getLegacyStarshipActorSystem(actor)),
		...runtime.crew
	};
	return [
		getSizeLabel(actor, getLegacyStarshipActorSystem(actor)),
		`${deployment.crewCount ?? deployment.crew ?? 0} Crew`,
		`${deployment.passengerCount ?? deployment.passenger ?? 0} Passengers`
	];
}

function getStarshipSidebarMountPoint(root) {
	const sidebarContainers = [
		root.querySelector(".sidebar .stats"),
		root.querySelector("[data-application-part='sidebar'] .stats"),
		root.querySelector(".sheet-sidebar .stats"),
		root.querySelector(".sidebar"),
		root.querySelector("[data-application-part='sidebar']"),
		root.querySelector(".sheet-sidebar")
	].filter(Boolean);

	if ( sidebarContainers.length ) {
		return {
			container: sidebarContainers[0],
			reference: null,
			insertAfter: false,
			append: true
		};
	}

	return null;
}

async function renderStarshipSidebarSummary(root, actor) {
	root.querySelectorAll(".sw5e-starship-sidebar-summary").forEach(node => node.remove());

	const mountPoint = getStarshipSidebarMountPoint(root);
	if ( !mountPoint?.container ) return;

	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-summary.hbs"),
		{ entries: makeSidebarSummary(actor) }
	);

	const wrapper = document.createElement("section");
	wrapper.className = "meter-group sw5e-starship-sidebar-summary";
	wrapper.innerHTML = rendered;

	const { container, reference, insertAfter, append } = mountPoint;
	if ( reference?.parentElement === container ) {
		reference.insertAdjacentElement(insertAfter ? "afterend" : "beforebegin", wrapper);
		return;
	}

	if ( append ) container.append(wrapper);
	else container.prepend(wrapper);
}

function focusSheetItem(root, app, itemId, tabId = STOCK_CARGO_TAB_ID) {
	activateSheetTab(root, app, tabId);
	window.setTimeout(() => {
		const candidates = root.querySelectorAll(`[data-item-id="${itemId}"]`);
		const target = Array.from(candidates).find(node => !node.closest(".sw5e-starship-tab"));
		if ( !target ) return;
		target.scrollIntoView({ behavior: "smooth", block: "center" });
		target.classList.add("sw5e-starship-item-pulse");
		window.setTimeout(() => target.classList.remove("sw5e-starship-item-pulse"), 1800);
	}, 50);
}

function isStarshipWeaponItem(item) {
	if ( item?.type !== "weapon" ) return false;
	const typeValue = item.system?.type?.value ?? "";
	return /starship/i.test(typeValue) || getCompendiumPack(item) === "starshipweapons";
}

function getStarshipWeaponRollData(actor, item) {
	const rollData = foundry.utils.deepClone(actor?.getRollData?.() ?? {});
	if ( !item?.system?.ability && isStarshipWeaponItem(item) ) {
		const wisdomMod = Number.isFinite(Number(actor?.system?.abilities?.wis?.mod))
			? Number(actor.system.abilities.wis.mod)
			: 0;
		rollData.mod = wisdomMod;
	}
	return rollData;
}

async function rollStarshipWeaponDamage(item, actor, multiplier = 1) {
	const damageParts = Array.isArray(item?.system?.damage?.parts) ? item.system.damage.parts : [];
	if ( !damageParts.length ) {
		if ( typeof item?.use === "function" ) await item.use();
		return;
	}

	const rollData = getStarshipWeaponRollData(actor, item);
	const formula = damageParts
		.map(([part]) => {
			if ( multiplier === 2 ) return `(${part}) * 2`;
			if ( multiplier === 0.5 ) return `floor((${part}) / 2)`;
			return part;
		})
		.join(" + ");
	const damageTypes = damageParts.map(([, type]) => type).filter(Boolean);
	const roll = new CONFIG.Dice.DamageRoll(formula, rollData, {});
	await roll.evaluate();
	const routingNote = multiplier === 2
		? localizeOrFallback("SW5E.PowerRoutingWeaponsPositive", "Weapons deal double damage")
		: multiplier === 0.5
			? localizeOrFallback("SW5E.PowerRoutingWeaponsNegative", "Ship weapon damage is reduced by half")
			: "";
	const typeLabel = damageTypes
		.map(type => CONFIG.DND5E?.damageTypes?.[type]?.label ?? CONFIG.DND5E?.damageTypes?.[type] ?? type)
		.join(", ");
	await roll.toMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: [item.name, typeLabel ? `(${typeLabel})` : "", routingNote].filter(Boolean).join(" ")
	});
}

async function useStarshipItem(item, actor = item?.actor) {
	if ( !item ) return;
	if ( actor && isStarshipWeaponItem(item) ) {
		const weaponRouting = getDerivedStarshipRuntime(actor).routing?.weaponsMultiplier ?? 1;
		if ( weaponRouting !== 1 ) {
			if ( typeof item.rollAttack === "function" ) {
				try {
					await item.rollAttack();
				} catch ( err ) {
					console.warn("SW5E MODULE | Failed starship weapon attack roll.", err);
				}
			}
			await rollStarshipWeaponDamage(item, actor, weaponRouting);
			return;
		}
	}

	const methods = ["use", "roll", "displayCard", "toMessage"];
	for ( const method of methods ) {
		if ( typeof item?.[method] !== "function" ) continue;
		try {
			const result = await item[method]();
			if ( result !== false ) return;
		} catch ( err ) {
			console.warn(`SW5E MODULE | Failed starship item action via ${method}.`, err);
		}
	}

	item.sheet?.render(true);
}

async function renderStarshipLayer(app, html, data) {
	const actor = data.actor ?? app.actor;
	if ( !isSw5eStarshipActor(actor) ) return;

	const root = getHtmlRoot(html);
	if ( !root ) return;
	root.classList.add("sw5e-starship-sheet");
	root.querySelectorAll(".sw5e-starship-tab, .sw5e-starship-tab-button, .sw5e-starship-tab-host, .sw5e-starship-sidebar-summary").forEach(node => node.remove());
	await ensureWarningsDialog(root, app, actor);
	await renderStarshipSidebarSummary(root, actor);

	const { nav, panelParent, integrated } = ensureStarshipTabTargets(root);
	if ( !nav || !panelParent ) return;
	if ( app._sw5eStarshipActiveTab === undefined ) setStarshipActiveTab(app, STARSHIP_TAB_ID);

	const { workspaceGroups, featureGroups } = partitionStarshipGroups(actor);
	const skills = getStarshipSkillEntries(actor);

	const [rendered, renderedFeatures] = await Promise.all([
		foundry.applications.handlebars.renderTemplate(getModulePath("templates/starship-sheet-layer.hbs"), {
			actorName: actor.name,
			actorImage: actor.img,
			title: localizeOrFallback("TYPES.Actor.starshipPl", "Starship Systems"),
			subtitle: localizeOrFallback("TYPES.Actor.vehicle", "Vehicle Actor"),
			headerBadges: makeHeaderBadges(actor),
			overviewCards: makeOverviewCards(actor),
			groups: workspaceGroups.map(group => ({ ...group, supportsSheetNavigation: integrated })),
			legacyNotes: getLegacyNotes(actor),
			skills
		}),
		foundry.applications.handlebars.renderTemplate(getModulePath("templates/starship-features-layer.hbs"), {
			title: localizeOrFallback("SW5E.Feature.Starship.Label", "Starship Features"),
			subtitle: "Manage configuration items and remove or replace them through the stock vehicle sheet.",
			groups: featureGroups.map(group => ({ ...group, supportsSheetNavigation: integrated }))
		})
	]);

	const tabButton = document.createElement("a");
	tabButton.className = "sw5e-starship-tab-button";
	tabButton.dataset.group = "primary";
	tabButton.dataset.tab = STARSHIP_TAB_ID;
	tabButton.innerHTML = `<span>SW5E</span>`;

	const featuresTabButton = document.createElement("a");
	featuresTabButton.className = "sw5e-starship-tab-button sw5e-starship-features-tab-button";
	featuresTabButton.dataset.group = "primary";
	featuresTabButton.dataset.tab = STARSHIP_FEATURES_TAB_ID;
	featuresTabButton.innerHTML = `<span>${localizeOrFallback("SW5E.Feature.Starship.LabelPl", "Starship Features")}</span>`;

	const wrapper = document.createElement("section");
	wrapper.className = "tab sw5e-starship-tab";
	wrapper.dataset.group = "primary";
	wrapper.dataset.tab = STARSHIP_TAB_ID;
	wrapper.innerHTML = rendered;
	wrapper.hidden = getStarshipActiveTab(app) !== STARSHIP_TAB_ID;
	if ( getStarshipActiveTab(app) === STARSHIP_TAB_ID ) wrapper.classList.add("active");

	const featuresWrapper = document.createElement("section");
	featuresWrapper.className = "tab sw5e-starship-tab sw5e-starship-features-tab";
	featuresWrapper.dataset.group = "primary";
	featuresWrapper.dataset.tab = STARSHIP_FEATURES_TAB_ID;
	featuresWrapper.innerHTML = renderedFeatures;
	featuresWrapper.hidden = getStarshipActiveTab(app) !== STARSHIP_FEATURES_TAB_ID;
	if ( getStarshipActiveTab(app) === STARSHIP_FEATURES_TAB_ID ) featuresWrapper.classList.add("active");

	nav.append(tabButton);
	nav.append(featuresTabButton);
	panelParent.append(wrapper);
	panelParent.append(featuresWrapper);

	tabButton.addEventListener("click", event => {
		event.preventDefault();
		activateSheetTab(root, app, STARSHIP_TAB_ID);
	});

	featuresTabButton.addEventListener("click", event => {
		event.preventDefault();
		activateSheetTab(root, app, STARSHIP_FEATURES_TAB_ID);
	});

	const handleTabClick = async event => {
		const actionNode = event.target.closest("[data-sw5e-action]");
		if ( !actionNode ) return;

		event.preventDefault();
		const action = actionNode.dataset.sw5eAction;
		if ( action === "open-item" ) {
			actor.items.get(actionNode.dataset.itemId)?.sheet?.render(true);
			return;
		}

		if ( action === "use-item" ) {
			await useStarshipItem(actor.items.get(actionNode.dataset.itemId), actor);
			return;
		}

		if ( action === "delete-item" ) {
			await actor.items.get(actionNode.dataset.itemId)?.delete();
			return;
		}

		if ( action === "focus-item" ) {
			focusSheetItem(root, app, actionNode.dataset.itemId, actionNode.dataset.tab || STOCK_CARGO_TAB_ID);
			return;
		}

		if ( action === "open-tab" ) {
			activateSheetTab(root, app, actionNode.dataset.tab);
			return;
		}

		if ( action === "roll-skill" ) {
			await rollStarshipSkill(actor, actionNode.dataset.skillId, event);
		}
	};

	wrapper.addEventListener("click", handleTabClick);
	featuresWrapper.addEventListener("click", handleTabClick);

	if ( integrated ) {
		nav.querySelectorAll("[data-tab]").forEach(item => {
			if ( item === tabButton || item === featuresTabButton ) return;
			if ( CUSTOM_STARSHIP_TAB_IDS.has(item.dataset.tab) ) return;
			item.addEventListener("click", () => {
				setStarshipActiveTab(app, null);
			});
		});
		const activeTab = getStarshipActiveTab(app);
		if ( activeTab ) activateSheetTab(root, app, activeTab);
	}
}

export function patchStarshipSheet() {
	Hooks.on("renderActorSheetV2", renderStarshipLayer);
}
