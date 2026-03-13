import { getModulePath } from "../module-support.mjs";

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
	const nav = getPrimaryTabNav(root);
	return nav?.querySelector(`.item[data-tab="${tabId}"]`) ?? null;
}

function getStarshipActiveTab(app) {
	if ( app?._sw5eStarshipActiveTab === true ) return STARSHIP_TAB_ID;
	if ( app?._sw5eStarshipActiveTab === false ) return null;
	return typeof app?._sw5eStarshipActiveTab === "string" ? app._sw5eStarshipActiveTab : null;
}

function setStarshipActiveTab(app, tabId=null) {
	app._sw5eStarshipActiveTab = tabId;
}

function isCustomStarshipTab(tabId) {
	return CUSTOM_STARSHIP_TAB_IDS.has(tabId);
}

function activatePrimaryTab(root, tabId) {
	const nav = getPrimaryTabNav(root);
	if ( nav ) {
		nav.querySelectorAll(".item[data-tab]").forEach(item => {
			item.classList.toggle("active", item.dataset.tab === tabId);
		});
	}

	root.querySelectorAll(".tab[data-group='primary']").forEach(panel => {
		const isActive = panel.dataset.tab === tabId;
		panel.classList.toggle("active", isActive);
		panel.hidden = !isActive;
	});
}

function activateSheetTab(root, app, tabId) {
	if ( isCustomStarshipTab(tabId) ) {
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

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized === key ? fallback : localized;
}

function isSw5eStarshipActor(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

function getLegacyStarshipSystem(actor) {
	return actor?.flags?.sw5e?.legacyStarshipActor?.system ?? {};
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
	if ( currentValue == null && maxValue == null ) return "\u2014";
	if ( maxValue == null ) return `${currentValue ?? 0}`;
	return `${currentValue ?? 0} / ${maxValue}`;
}

function formatMovement(actor, legacySystem) {
	const legacyMovement = legacySystem.attributes?.movement ?? {};
	const units = legacyMovement.units || actor.system?.attributes?.movement?.units || "ft";
	const space = Number.isFinite(Number(legacyMovement.space)) ? Number(legacyMovement.space) : null;
	const turn = Number.isFinite(Number(legacyMovement.turn)) ? Number(legacyMovement.turn) : null;
	if ( space != null || turn != null ) {
		return {
			primary: `${space ?? 0} ${units}`,
			secondary: turn != null ? `Turn ${turn}` : ""
		};
	}

	const fly = Number.isFinite(Number(actor.system?.attributes?.movement?.fly))
		? Number(actor.system.attributes.movement.fly)
		: null;
	return {
		primary: fly != null ? `${fly} ${units}` : "\u2014",
		secondary: ""
	};
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
	return CONFIG.DND5E.actorSizes?.[sizeKey] ?? sizeKey ?? "\u2014";
}

function makeOverviewCards(actor) {
	const legacySystem = getLegacyStarshipSystem(actor);
	const movement = formatMovement(actor, legacySystem);

	return [
		{
			label: localizeOrFallback("SW5E.Movement", "Movement"),
			value: movement.primary,
			note: movement.secondary || localizeOrFallback("SW5E.MovementSpace", "Space")
		}
	];
}

function makeSidebarSummary(actor) {
	const legacySystem = getLegacyStarshipSystem(actor);
	const hp = actor.system?.attributes?.hp ?? {};
	const shields = legacySystem.attributes?.hp ?? {};
	const fuel = legacySystem.attributes?.fuel?.value;
	const routing = legacySystem.attributes?.power?.routing ?? "none";

	return [
		{
			label: localizeOrFallback("SW5E.StarshipTier", "Tier"),
			value: Number.isFinite(Number(legacySystem.details?.tier)) ? `${legacySystem.details.tier}` : "\u2014",
			note: normalizeSourceLabel(legacySystem.details?.source)
		},
		{
			label: localizeOrFallback("SW5E.Size", "Size"),
			value: getSizeLabel(actor, legacySystem),
			note: actor.type
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
			value: Number.isFinite(Number(fuel)) ? `${fuel}` : "\u2014",
			note: `${localizeOrFallback("SW5E.SystemDamage", "System Damage")}: ${Number.isFinite(Number(legacySystem.attributes?.systemDamage)) ? Number(legacySystem.attributes.systemDamage) : 0}`
		},
		{
			label: localizeOrFallback("SW5E.PowerDie", "Power Routing"),
			value: localizeOrFallback(`SW5E.PowerRouting.${routing}`, routing),
			note: formatPowerSummary(legacySystem)
		}
	];
}

function getItemMeta(item) {
	if ( item.flags?.sw5e?.legacyStarshipSize ) return localizeOrFallback("SW5E.StarshipTier", "Size Profile");
	if ( item.flags?.sw5e?.legacyStarshipMod ) return item.flags.sw5e.legacyStarshipMod.type?.value ?? "Modification";
	if ( item.system?.type?.subtype ) return item.system.type.subtype;
	const pack = getCompendiumPack(item);
	return pack ? pack.replace(/-/g, " ") : "";
}

function makeItemEntry(item, defaultTab=STOCK_CARGO_TAB_ID) {
	return {
		id: item.id,
		name: item.name,
		meta: getItemMeta(item),
		img: item.img,
		defaultTab
	};
}

function categorizeStarshipItems(actor) {
	const groups = {
		size: {
			label: localizeOrFallback("TYPES.Item.starshipsizePl", "Starship Size"),
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID
		},
		actions: {
			label: localizeOrFallback("SW5E.Feature.StarshipAction.Label", "Starship Actions"),
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID
		},
		roles: {
			label: localizeOrFallback("SW5E.Feature.Deployment.Label", "Crew Roles"),
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID
		},
		features: {
			label: localizeOrFallback("SW5E.Feature.Starship.Label", "Starship Features"),
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID
		},
		equipment: {
			label: localizeOrFallback("SW5E.Equipment", "Equipment"),
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID
		},
		modifications: {
			label: localizeOrFallback("TYPES.Item.starshipmodPl", "Modifications"),
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID
		},
		weapons: {
			label: localizeOrFallback("SW5E.Weapon", "Weapons"),
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID
		}
	};

	for ( const item of actor.items ) {
		const pack = getCompendiumPack(item);
		const featType = item.system?.type?.value;

		if ( item.flags?.sw5e?.legacyStarshipSize ) groups.size.items.push(item);
		else if ( item.flags?.sw5e?.legacyStarshipMod || pack === "starshipmodifications" ) groups.modifications.items.push(item);
		else if ( featType === "starshipAction" || pack === "starshipactions" ) groups.actions.items.push(item);
		else if ( featType === "deployment" || pack === "deployments" || pack === "deploymentfeatures" || pack === "ventures" ) groups.roles.items.push(item);
		else if ( featType === "starship" || pack === "starshipfeatures" ) groups.features.items.push(item);
		else if ( pack === "starshipweapons" ) groups.weapons.items.push(item);
		else if ( pack === "starshiparmor" || pack === "starshipequipment" ) groups.equipment.items.push(item);
		else if ( pack && STARSHIP_PACKS.has(pack) ) groups.features.items.push(item);
	}

	return Object.values(groups)
		.map((group, index) => ({
			key: Object.keys(groups)[index],
			...group,
			count: group.items.length,
			manageLabel: group.defaultTab === STOCK_CARGO_TAB_ID
				? localizeOrFallback("DND5E.VEHICLE.Tabs.Cargo", "Cargo")
				: group.label,
			items: group.items.map(item => makeItemEntry(item, group.defaultTab))
		}))
		.filter(group => group.count > 0);
}

function partitionStarshipGroups(actor) {
	const groups = categorizeStarshipItems(actor);
	const featureKeys = new Set(["size", "roles", "features"]);
	return {
		workspaceGroups: groups.filter(group => !featureKeys.has(group.key)),
		featureGroups: groups.filter(group => featureKeys.has(group.key))
	};
}

function getLegacyNotes(actor) {
	const legacySystem = getLegacyStarshipSystem(actor);
	const notes = [];
	if ( legacySystem.attributes?.deployment ) {
		notes.push(localizeOrFallback("SW5E.VehicleCrew", "Crew deployment data preserved"));
	}
	if ( legacySystem.attributes?.power ) {
		notes.push(localizeOrFallback("SW5E.PowerDie", "Power routing preserved"));
	}
	if ( legacySystem.attributes?.hp?.temp != null || legacySystem.attributes?.hp?.tempmax != null ) {
		notes.push(localizeOrFallback("SW5E.ShieldPoints", "Shield data preserved"));
	}
	return notes;
}

function makeHeaderBadges(actor) {
	const legacySystem = getLegacyStarshipSystem(actor);
	const movement = formatMovement(actor, legacySystem);
	const badges = [
		getSizeLabel(actor, legacySystem),
		Number.isFinite(Number(legacySystem.details?.tier)) ? `${localizeOrFallback("SW5E.StarshipTier", "Tier")} ${legacySystem.details.tier}` : null,
		movement.primary !== "\u2014" ? movement.primary : null,
		normalizeSourceLabel(legacySystem.details?.source) || null
	];
	return badges.filter(Boolean);
}

function makeWorkspaceActions(actor) {
	const actions = [
		{ id: STOCK_CARGO_TAB_ID, label: localizeOrFallback("DND5E.VEHICLE.Tabs.Cargo", "Cargo") },
		{ id: STARSHIP_FEATURES_TAB_ID, label: localizeOrFallback("SW5E.Feature.Starship.Label", "Features") },
		{ id: "description", label: localizeOrFallback("DND5E.Description", "Description") },
		{ id: "effects", label: localizeOrFallback("DND5E.Effects", "Effects") }
	];
	return actions;
}

function ensureWarningsDialog(root, app, actor) {
	const form = getSheetForm(root, app);
	if ( !form || form.querySelector("dialog.warnings") ) return;

	const dialog = document.createElement("dialog");
	dialog.className = "warnings sw5e-starship-warnings-dialog";
	dialog.innerHTML = `
		<header>
			<h3>${localizeOrFallback("DND5E.Warnings", "Warnings")}</h3>
		</header>
		<section class="sw5e-starship-warnings-body">
			<p>${localizeOrFallback("DND5E.WarningDetails", "This sheet has one or more warnings from the dnd5e actor preparation step.")}</p>
			<p>${actor?.name ?? localizeOrFallback("TYPES.Actor.vehicle", "Vehicle Actor")}</p>
		</section>
		<form method="dialog">
			<button type="submit">${localizeOrFallback("Close", "Close")}</button>
		</form>
	`;
	form.append(dialog);
}

function ensureStarshipTabTargets(root) {
	const nav = getPrimaryTabNav(root);
	const panelParent = getPrimaryTabPanelParent(root);
	if ( nav && panelParent && panelParent !== root ) return { nav, panelParent, integrated: true };

	const mountPoint = root.querySelector(".sheet-body") ?? root.querySelector(".window-content") ?? root;
	let host = root.querySelector(".sw5e-starship-tab-host");
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

function getStarshipSidebarMountPoint(root) {
	const sidebar = root.querySelector(".sidebar .stats");
	const hpButton = root.querySelector('[data-action="hitPoints"]');
	const hpGroup = hpButton?.closest(".meter-group");
	if ( hpGroup?.parentElement ) {
		return {
			container: hpGroup.parentElement,
			reference: hpGroup,
			insertAfter: true,
			append: false,
			source: "hit-points-meter"
		};
	}

	if ( root.classList?.contains("tidy5e-sheet") ) {
		const sidePanel = root.querySelector(".attributes .side-panel");
		if ( sidePanel ) {
			return {
				container: sidePanel,
				reference: null,
				insertAfter: false,
				append: false,
				source: "tidy-side-panel"
			};
		}
	}

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
			append: true,
			source: "sidebar-container"
		};
	}

	const fieldAnchor = [
		root.querySelector('[name="system.traits.size"]'),
		root.querySelector('[name="system.attributes.capacity.cargo"]'),
		root.querySelector('[name="system.attributes.capacity.crew"]'),
		root.querySelector('[name="system.attributes.capacity.passengers"]')
	].find(Boolean);

	const fieldGroup = fieldAnchor?.closest(".form-group, .meter-group, .input-group, li, .trait, .form-fields, section, div");
	if ( fieldGroup?.parentElement ) {
		return {
			container: fieldGroup.parentElement,
			reference: fieldGroup,
			insertAfter: false,
			append: false,
			source: "sidebar-field-anchor"
		};
	}

	const profileImage = root.querySelector("img.profile, .profile img, .portrait img, .profile-img");
	const profileBlock = profileImage?.closest("section, aside, header, div");
	if ( profileBlock?.parentElement ) {
		return {
			container: profileBlock.parentElement,
			reference: profileBlock,
			insertAfter: true,
			append: false,
			source: "profile-block"
		};
	}

	return null;
}

async function renderStarshipSidebarSummary(root, actor) {
	root.querySelectorAll(".sw5e-starship-sidebar-summary").forEach(node => node.remove());

	const mountPoint = getStarshipSidebarMountPoint(root);
	if ( !mountPoint?.container ) {
		console.warn("SW5E MODULE | Starship sidebar summary mount point not found.", {
			actorId: actor?.id,
			actorName: actor?.name
		});
		return;
	}

	console.debug("SW5E MODULE | Mounting starship sidebar summary.", {
		actorId: actor?.id,
		actorName: actor?.name,
		source: mountPoint.source
	});

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

function focusSheetItem(root, app, itemId, tabId=STOCK_CARGO_TAB_ID) {
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

async function useStarshipItem(item) {
	if ( !item ) return;

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
	ensureWarningsDialog(root, app, actor);
	await renderStarshipSidebarSummary(root, actor);

	const { nav, panelParent, integrated } = ensureStarshipTabTargets(root);
	if ( !nav || !panelParent ) return;
	if ( app._sw5eStarshipActiveTab === undefined ) setStarshipActiveTab(app, STARSHIP_TAB_ID);

	const { workspaceGroups, featureGroups } = partitionStarshipGroups(actor);

	const [rendered, renderedFeatures] = await Promise.all([
		foundry.applications.handlebars.renderTemplate(getModulePath("templates/starship-sheet-layer.hbs"), {
			actorName: actor.name,
			actorImage: actor.img,
			title: localizeOrFallback("TYPES.Actor.starshipPl", "Starship Systems"),
			subtitle: localizeOrFallback("TYPES.Actor.vehicle", "Vehicle Actor"),
			headerBadges: makeHeaderBadges(actor),
			workspaceActions: integrated ? makeWorkspaceActions(actor) : [],
			overviewCards: makeOverviewCards(actor),
			groups: workspaceGroups.map(group => ({ ...group, supportsSheetNavigation: integrated })),
			legacyNotes: getLegacyNotes(actor)
		}),
		foundry.applications.handlebars.renderTemplate(getModulePath("templates/starship-features-layer.hbs"), {
			title: localizeOrFallback("SW5E.Feature.Starship.Label", "Starship Features"),
			subtitle: "Manage configuration items and remove or replace them through the stock cargo tools.",
			workspaceActions: integrated ? makeWorkspaceActions(actor) : [],
			groups: featureGroups.map(group => ({ ...group, supportsSheetNavigation: integrated }))
		})
	]);

	const tabButton = document.createElement("button");
	tabButton.type = "button";
	tabButton.className = "item sw5e-starship-tab-button";
	tabButton.dataset.group = "primary";
	tabButton.dataset.tab = STARSHIP_TAB_ID;
	tabButton.textContent = "SW5E";

	const featuresTabButton = document.createElement("button");
	featuresTabButton.type = "button";
	featuresTabButton.className = "item sw5e-starship-tab-button sw5e-starship-features-tab-button";
	featuresTabButton.dataset.group = "primary";
	featuresTabButton.dataset.tab = STARSHIP_FEATURES_TAB_ID;
	featuresTabButton.textContent = localizeOrFallback("SW5E.Feature.Starship.Label", "Features");

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
		if ( action === "open-item" || action === "edit-item" ) {
			const item = actor.items.get(actionNode.dataset.itemId);
			item?.sheet?.render(true);
			return;
		}

		if ( action === "use-item" ) {
			await useStarshipItem(actor.items.get(actionNode.dataset.itemId));
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
		}
	};

	wrapper.addEventListener("click", handleTabClick);
	featuresWrapper.addEventListener("click", handleTabClick);

	if ( integrated ) {
		nav.querySelectorAll(".item[data-tab]").forEach(item => {
			if ( item === tabButton || item === featuresTabButton ) return;
			if ( isCustomStarshipTab(item.dataset.tab) ) return;
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
