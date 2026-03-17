import { getModulePath } from "../module-support.mjs";
import {
	POWER_ROUTE_KEYS,
	POWER_SLOT_KEYS,
	getLegacyStarshipSystem,
	getShieldDamageMultiplier,
	getShieldRegenMultiplier,
	getShieldState,
	getPowerRoutingEffectIndex as getSharedRoutingEffectIndex,
	getPowerRoutingMultiplier,
	getPowerStationValue as getSharedPowerStationValue,
	getStarshipPowerRouting,
	isSw5eStarshipActor
} from "../starship-routing.mjs";

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
const STARSHIP_CREW_TAB_ID = "sw5e-starship-crew";
const STARSHIP_WEAPONS_TAB_ID = "sw5e-starship-weapons";
const STOCK_CARGO_TAB_ID = "cargo";
const CUSTOM_STARSHIP_TAB_IDS = new Set([STARSHIP_TAB_ID, STARSHIP_FEATURES_TAB_ID, STARSHIP_CREW_TAB_ID, STARSHIP_WEAPONS_TAB_ID]);
const POWER_ROUTE_SYMBOLS = ["↓", "=", "↑"];
const POWER_ROUTE_EFFECTS = ["negative", "neutral", "positive"];
const POWER_SLOT_LABELS = {
	central: "Central",
	comms: "Comms",
	engines: "Engines",
	sensors: "Sensors",
	shields: "Shields",
	weapons: "Weapons"
};
const POWER_ROUTE_EFFECT_FALLBACKS = {
	engines: {
		positive: "The ship's flying speed is doubled",
		neutral: "No effect",
		negative: "The ship's flying speed is reduced by half"
	},
	shields: {
		positive: "Shields take half damage and regenerate twice as fast",
		neutral: "No effect",
		negative: "Shields take double damage and regenerate at half speed"
	},
	weapons: {
		positive: "Weapons deal double damage",
		neutral: "No effect",
		negative: "Ship weapon damage is reduced by half"
	}
};

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

function upperFirst(value="") {
	return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}

function getCompendiumPack(item) {
	const sourceId = item?.flags?.core?.sourceId;
	const match = /^Compendium\.[^.]+\.([^.]+)\./.exec(sourceId ?? "");
	return match?.[1] ?? null;
}

function lookupDocumentName(uuid) {
	if ( typeof uuid !== "string" || !uuid ) return "\u2014";
	try {
		const resolved = globalThis.fromUuidSync?.(uuid);
		if ( resolved?.name ) return resolved.name;
	} catch (_err) {}

	if ( uuid.startsWith("Actor.") ) {
		const actorId = uuid.split(".")[1];
		return game.actors?.get(actorId)?.name ?? actorId ?? uuid;
	}

	return uuid.split(".").pop() ?? uuid;
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

function formatNumericValue(value) {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? `${numericValue}` : "\u2014";
}

function formatWeightValue(value, units="") {
	const numericValue = Number(value);
	if ( !Number.isFinite(numericValue) ) return "\u2014";
	return units ? `${numericValue} ${units}` : `${numericValue}`;
}

function formatCapacityValue(actor, key) {
	if ( key === "cargo" ) {
		const cargo = actor.system?.attributes?.capacity?.cargo ?? {};
		return formatWeightValue(cargo.value, cargo.units);
	}

	const numericValue = Number(actor.system?.[key]?.max);
	return Number.isFinite(numericValue) ? `${numericValue}` : "\u2014";
}

function formatMovement(actor, legacySystem) {
	const legacyMovement = legacySystem.attributes?.movement ?? {};
	const units = legacyMovement.units || actor.system?.attributes?.movement?.units || "ft";
	const space = Number.isFinite(Number(legacyMovement.space)) ? Number(legacyMovement.space) : null;
	const turn = Number.isFinite(Number(legacyMovement.turn)) ? Number(legacyMovement.turn) : null;
	const movementMultiplier = getPowerRoutingMultiplier(actor, "engines");
	if ( space != null || turn != null ) {
		const adjustedSpace = space != null ? Math.max(0, Math.floor(space * movementMultiplier)) : null;
		return {
			primary: `${adjustedSpace ?? 0} ${units}`,
			secondary: turn != null ? `Turn ${turn}` : ""
		};
	}

	const fly = Number.isFinite(Number(actor.system?.attributes?.movement?.fly))
		? Number(actor.system.attributes.movement.fly)
		: null;
	return {
		primary: fly != null ? `${Math.max(0, Math.floor(fly))} ${units}` : "\u2014",
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

function formatRoutingMechanicsSummary(actor) {
	const movementMultiplier = getPowerRoutingMultiplier(actor, "engines");
	const shieldDamageMultiplier = getShieldDamageMultiplier(actor);
	const shieldRegenMultiplier = getShieldRegenMultiplier(actor);
	const weaponMultiplier = getPowerRoutingMultiplier(actor, "weapons");
	return `Flight x${movementMultiplier} | Shields x${shieldDamageMultiplier} dmg / x${shieldRegenMultiplier} regen | Weapons x${weaponMultiplier}`;
}

function getPowerSlotLabel(key) {
	return localizeOrFallback(`SW5E.PowerDieSlot${upperFirst(key)}`, POWER_SLOT_LABELS[key] ?? upperFirst(key));
}

function getPowerStationValue(legacySystem, key) {
	return getSharedPowerStationValue({ flags: { sw5e: { legacyStarshipActor: { type: "starship", system: legacySystem } } } }, key);
}

function getRoutingLabel(legacySystem) {
	const routing = getStarshipPowerRouting({ flags: { sw5e: { legacyStarshipActor: { type: "starship", system: legacySystem } } } });
	if ( routing === "none" ) return "Balanced";
	return localizeOrFallback(`SW5E.PowerRouting${upperFirst(routing)}`, upperFirst(routing));
}

function getRoutingEffectIndex(routing, key) {
	return getSharedRoutingEffectIndex(routing, key);
}

function getRoutingEffectLabel(key, effectKey) {
	return localizeOrFallback(
		`SW5E.PowerRouting${upperFirst(key)}${upperFirst(effectKey)}`,
		POWER_ROUTE_EFFECT_FALLBACKS[key]?.[effectKey] ?? "No effect"
	);
}

function getPowerAllocationTotal(legacySystem) {
	return POWER_SLOT_KEYS.reduce((total, key) => total + getPowerStationValue(legacySystem, key), 0);
}

function getSizeLabel(actor, legacySystem) {
	const sizeKey = actor.system?.traits?.size ?? legacySystem.traits?.size ?? "";
	return CONFIG.DND5E.actorSizes?.[sizeKey] ?? sizeKey ?? "\u2014";
}

function makeSummaryCards(actor) {
	const legacySystem = getLegacyStarshipSystem(actor);
	const hp = actor.system?.attributes?.hp ?? {};
	const shields = getShieldState(actor);
	const fuel = legacySystem.attributes?.fuel?.value;
	const movement = formatMovement(actor, legacySystem);
	const ac = actor.system?.attributes?.ac?.value;
	return [
		{
			label: localizeOrFallback("SW5E.ArmorClass", "Armor Class"),
			value: formatNumericValue(ac),
			note: "Defensive profile",
			tone: "defense"
		},
		{
			label: localizeOrFallback("SW5E.HullPoints", "Hull Points"),
			value: formatPool(hp.value, hp.max),
			note: "Structural integrity",
			tone: "hull"
		},
		{
			label: localizeOrFallback("SW5E.ShieldPoints", "Shield Points"),
			value: formatPool(shields.value, shields.max),
			note: "Shield envelope (live sync)",
			tone: "shields"
		},
		{
			label: localizeOrFallback("SW5E.Fuel", "Fuel"),
			value: formatNumericValue(fuel),
			note: "Consumable reserve",
			tone: "fuel"
		},
		{
			label: localizeOrFallback("SW5E.Movement", "Movement"),
			value: movement.primary,
			note: movement.secondary || localizeOrFallback("SW5E.MovementSpace", "Space"),
			tone: "movement"
		},
		{
			label: localizeOrFallback("SW5E.PowerDie", "Power Routing"),
			value: getRoutingLabel(legacySystem),
			note: `${formatPowerSummary(legacySystem)} | ${formatRoutingMechanicsSummary(actor)}`,
			tone: "power"
		}
	];
}

function makeBridgeStatusEntries(actor) {
	const legacySystem = getLegacyStarshipSystem(actor);
	return [
		{
			label: localizeOrFallback("SW5E.StarshipTier", "Tier"),
			value: Number.isFinite(Number(legacySystem.details?.tier)) ? `${legacySystem.details.tier}` : "\u2014",
			note: normalizeSourceLabel(legacySystem.details?.source)
		},
		{
			label: localizeOrFallback("SW5E.Size", "Size"),
			value: getSizeLabel(actor, legacySystem),
			note: localizeOrFallback("TYPES.Actor.vehicle", "Vehicle Actor")
		},
		{
			label: localizeOrFallback("SW5E.SystemDamage", "System Damage"),
			value: formatNumericValue(legacySystem.attributes?.systemDamage),
			note: "Critical systems strain"
		},
		{
			label: localizeOrFallback("DND5E.VEHICLE.FIELDS.crew.max.label", "Crew"),
			value: formatCapacityValue(actor, "crew"),
			note: "Operational complement"
		},
		{
			label: localizeOrFallback("DND5E.VEHICLE.FIELDS.passengers.max.label", "Passengers"),
			value: formatCapacityValue(actor, "passengers"),
			note: "Non-crew capacity"
		},
		{
			label: localizeOrFallback("DND5E.VEHICLE.FIELDS.attributes.capacity.cargo.value.label", "Cargo"),
			value: formatCapacityValue(actor, "cargo"),
			note: "Transport capacity"
		},
		{
			label: localizeOrFallback("SW5E.Source", "Source"),
			value: normalizeSourceLabel(legacySystem.details?.source) || "\u2014",
			note: localizeOrFallback("SW5E.StarshipProfile", "Legacy starship profile")
		}
	];
}

function makeBridgeLogisticsEntries(actor) {
	const legacySystem = getLegacyStarshipSystem(actor);
	const movement = formatMovement(actor, legacySystem);
	const actions = actor.system?.attributes?.actions ?? {};
	const actionMax = Number.isFinite(Number(actions.max)) ? Number(actions.max) : null;
	const actionSpent = Number.isFinite(Number(actions.spent)) ? Number(actions.spent) : null;
	const thresholds = Array.isArray(actions.thresholds)
		? actions.thresholds.filter(value => Number.isFinite(Number(value))).map(value => Number(value))
		: [];

	return [
		{
			label: localizeOrFallback("SW5E.Movement", "Movement"),
			value: movement.primary,
			note: movement.secondary || "Speed and turn"
		},
		{
			label: localizeOrFallback("SW5E.Fuel", "Fuel"),
			value: formatNumericValue(legacySystem.attributes?.fuel?.value),
			note: "Remaining burn reserve"
		},
		{
			label: localizeOrFallback("SW5E.PowerDie", "Power Routing"),
			value: getRoutingLabel(legacySystem),
			note: `${formatPowerSummary(legacySystem)} | ${formatRoutingMechanicsSummary(actor)}`
		},
		{
			label: localizeOrFallback("DND5E.VEHICLE.FIELDS.attributes.actions.label", "Actions"),
			value: actionMax != null ? `${Math.max(actionMax - (actionSpent ?? 0), 0)} / ${actionMax}` : "\u2014",
			note: thresholds.length ? `Thresholds ${thresholds.join(" / ")}` : "Available stations"
		},
		{
			label: localizeOrFallback("DND5E.ArmorClass", "Armor Class"),
			value: formatNumericValue(actor.system?.attributes?.ac?.value),
			note: "Ship defense baseline"
		}
	];
}

function makeSidebarSummary(actor) {
	const legacySystem = getLegacyStarshipSystem(actor);
	return [
		{
			label: localizeOrFallback("SW5E.StarshipTier", "Tier"),
			value: Number.isFinite(Number(legacySystem.details?.tier)) ? `${legacySystem.details.tier}` : "\u2014"
		},
		{
			label: localizeOrFallback("SW5E.Size", "Size"),
			value: getSizeLabel(actor, legacySystem)
		},
		{
			label: localizeOrFallback("SW5E.Source", "Source"),
			value: normalizeSourceLabel(legacySystem.details?.source) || "\u2014"
		}
	];
}

function makePowerRoutingData(actor) {
	const legacySystem = getLegacyStarshipSystem(actor);
	const routing = legacySystem.attributes?.power?.routing ?? "none";
	const totalAllocated = getPowerAllocationTotal(legacySystem);
	return {
		kicker: "Power",
		title: localizeOrFallback("SW5E.PowerRouting", "Power Routing"),
		summary: routing === "none"
			? `Balanced output across all routed systems. ${formatRoutingMechanicsSummary(actor)}.`
			: `${getRoutingLabel(legacySystem)} currently has priority. ${formatRoutingMechanicsSummary(actor)}.`,
		allocationLabel: localizeOrFallback("SW5E.PowerDieAlloc", "Power Die Allocation"),
		totalLabel: "Allocated",
		totalValue: `${totalAllocated}`,
		clearLabel: "Balance Grid",
		routes: POWER_ROUTE_KEYS.map(key => {
			const effectIndex = getRoutingEffectIndex(routing, key);
			const effectKey = POWER_ROUTE_EFFECTS[effectIndex];
			return {
				key,
				label: getRoutingLabel({ attributes: { power: { routing: key } } }),
				value: effectIndex,
				symbol: POWER_ROUTE_SYMBOLS[effectIndex],
				effect: getRoutingEffectLabel(key, effectKey),
				isPrimary: routing === key
			};
		}),
		slots: POWER_SLOT_KEYS.map(key => ({
			key,
			label: getPowerSlotLabel(key),
			value: getPowerStationValue(legacySystem, key),
			isPrimary: routing === key
		}))
	};
}

function clampPowerRoutingValue(value) {
	const numericValue = Number(value);
	if ( !Number.isFinite(numericValue) ) return 1;
	return Math.max(0, Math.min(2, Math.round(numericValue)));
}

function clampPowerSlotValue(value) {
	const numericValue = Number(value);
	if ( !Number.isFinite(numericValue) ) return 0;
	return Math.max(0, Math.floor(numericValue));
}

async function updateStarshipPowerRouting(actor, routing) {
	if ( !actor?.isOwner ) return;
	const nextRouting = POWER_ROUTE_KEYS.includes(routing) ? routing : "none";
	await actor.update({
		"flags.sw5e.legacyStarshipActor.system.attributes.power.routing": nextRouting
	});
}

async function updateStarshipPowerRoutingFromSlider(actor, routeKey, sliderValue) {
	if ( !POWER_ROUTE_KEYS.includes(routeKey) ) return;
	const nextRouting = clampPowerRoutingValue(sliderValue) === 2 ? routeKey : "none";
	await updateStarshipPowerRouting(actor, nextRouting);
}

async function updateStarshipPowerSlot(actor, slotKey, slotValue) {
	if ( !actor?.isOwner || !POWER_SLOT_KEYS.includes(slotKey) ) return;
	await actor.update({
		[`flags.sw5e.legacyStarshipActor.system.attributes.power.${slotKey}.value`]: clampPowerSlotValue(slotValue)
	});
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

function getWeaponBankKey(item) {
	const rawValue = String(item.system?.type?.value ?? "").toLowerCase().trim();
	if ( rawValue.includes("primary") ) return "primary";
	if ( rawValue.includes("secondary") ) return "secondary";
	if ( rawValue.includes("tertiary") ) return "tertiary";
	if ( rawValue.includes("quaternary") ) return "quaternary";
	return "other";
}

function getWeaponBankLabel(bankKey) {
	const labels = {
		primary: "Primary Bank",
		secondary: "Secondary Bank",
		tertiary: "Tertiary Bank",
		quaternary: "Quaternary Bank",
		other: "Auxiliary Weapons"
	};
	return labels[bankKey] ?? labels.other;
}

function formatWeaponRange(item) {
	const range = item.system?.range ?? {};
	const normal = Number(range.value);
	const long = Number(range.long);
	const units = range.units || "ft";
	if ( Number.isFinite(normal) && Number.isFinite(long) ) return `${normal}/${long} ${units}`;
	if ( Number.isFinite(normal) ) return `${normal} ${units}`;
	return "\u2014";
}

function formatWeaponCharges(item) {
	const ammo = item.system?.ammo ?? {};
	const uses = item.system?.uses ?? {};
	const ammoValue = Number(ammo.value);
	const ammoMax = Number(ammo.max);
	const usesValue = Number(uses.value);
	const usesMax = Number(uses.max);

	if ( Number.isFinite(ammoValue) || Number.isFinite(ammoMax) ) {
		return formatPool(ammoValue, ammoMax);
	}

	if ( Number.isFinite(usesValue) || Number.isFinite(usesMax) ) {
		return formatPool(usesValue, usesMax);
	}

	return "\u2014";
}

function formatWeaponUsage(item) {
	const activation = item.system?.activation ?? {};
	const type = activation.type;
	if ( !type ) return "\u2014";
	const cost = Number.isFinite(Number(activation.cost)) ? Number(activation.cost) : null;
	const label = localizeOrFallback(`DND5E.ACTIVATION.${type}`, type);
	return cost && cost > 1 ? `${cost} ${label}` : label;
}

function makeWeaponTelemetry(item) {
	const arc = String(item.system?.firingArc ?? "").trim();
	const telemetry = [
		{ label: "Arc", value: arc || "\u2014" },
		{ label: "Range", value: formatWeaponRange(item) },
		{ label: "Charges", value: formatWeaponCharges(item) },
		{ label: "Usage", value: formatWeaponUsage(item) }
	];

	const quantity = Number(item.system?.quantity);
	if ( Number.isFinite(quantity) && quantity > 1 ) {
		telemetry.splice(2, 0, { label: "Qty", value: `${quantity}` });
	}

	return telemetry;
}

function makeWeaponTags(item) {
	const tags = [];
	if ( item.system?.crewed ) tags.push("Crewed");
	if ( item.system?.equipped ) tags.push("Powered");
	if ( Array.isArray(item.system?.properties) ) {
		const visibleProperties = item.system.properties.slice(0, 3);
		visibleProperties.forEach(property => tags.push(String(property)));
	}
	return tags;
}

function makeWeaponConsoleEntry(item, defaultTab=STOCK_CARGO_TAB_ID) {
	return {
		id: item.id,
		name: item.name,
		img: item.img,
		meta: getItemMeta(item),
		defaultTab,
		telemetry: makeWeaponTelemetry(item),
		tags: makeWeaponTags(item)
	};
}

function categorizeStarshipItems(actor) {
	const groups = {
		actions: {
			label: localizeOrFallback("SW5E.Feature.StarshipAction.Label", "Starship Actions"),
			description: "Bridge actions and tactical maneuvers that define what the ship can do in the round.",
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID,
			browsePack: "starshipactions"
		},
		weapons: {
			label: localizeOrFallback("SW5E.Weapon", "Weapons"),
			description: "Installed batteries and weapon mounts, ready for quick access from the bridge.",
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID,
			browsePack: "starshipweapons"
		},
		equipment: {
			label: localizeOrFallback("SW5E.Equipment", "Equipment"),
			description: "Installed gear, armor, and shipboard support systems.",
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID,
			browsePack: "starshipequipment"
		},
		modifications: {
			label: localizeOrFallback("TYPES.Item.starshipmodPl", "Modifications"),
			description: "Upgrade packages and component swaps that change the ship's operational profile.",
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID,
			browsePack: "starshipmodifications"
		},
		roles: {
			label: localizeOrFallback("SW5E.Feature.Deployment.Label", "Crew Roles"),
			description: "Crew stations, deployments, and role features that support ship operations.",
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID,
			browsePack: "deployments"
		},
		features: {
			label: localizeOrFallback("SW5E.Feature.Starship.Label", "Starship Features"),
			description: "Passive systems, frame traits, and structural features that define the vessel.",
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID,
			browsePack: "starshipfeatures"
		},
		size: {
			label: localizeOrFallback("TYPES.Item.starshipsizePl", "Starship Size"),
			description: "Preserved frame and size-profile data for this starship conversion.",
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID,
			browsePack: null
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

function presentStarshipGroups(groups, { supportsSheetNavigation=false, showDelete=false, itemLimit=null }={}) {
	return groups.map(group => {
		const visibleItems = itemLimit ? group.items.slice(0, itemLimit) : group.items;
		return {
			...group,
			supportsSheetNavigation,
			showDelete,
			items: visibleItems,
			hasMore: itemLimit ? group.items.length > itemLimit : false,
			remainingCount: itemLimit ? Math.max(group.items.length - visibleItems.length, 0) : 0
		};
	});
}

function makeBridgeQuickGroups(actor, { supportsSheetNavigation=false }={}) {
	const bridgeKeys = new Set(["actions", "modifications"]);
	const groups = categorizeStarshipItems(actor).filter(group => bridgeKeys.has(group.key));
	return presentStarshipGroups(groups, { supportsSheetNavigation, showDelete: false, itemLimit: 4 });
}

function makeSystemsGroups(actor, { supportsSheetNavigation=false }={}) {
	const excludedKeys = new Set(["roles", "weapons"]);
	return presentStarshipGroups(
		categorizeStarshipItems(actor).filter(group => !excludedKeys.has(group.key)),
		{ supportsSheetNavigation, showDelete: true }
	);
}

function makeWeaponsConsoleSections(actor, { supportsSheetNavigation=false }={}) {
	const bankDescriptions = {
		primary: "Heavy forward batteries and mainline attack weapons.",
		secondary: "Support mounts and flexible secondary armaments.",
		tertiary: "Auxiliary hardpoints and specialist weapon mounts.",
		quaternary: "Light utility batteries and backup tactical systems.",
		other: "Weapons with preserved or unknown bank classifications."
	};
	const banks = new Map([
		["primary", { key: "primary", label: getWeaponBankLabel("primary"), description: bankDescriptions.primary, items: [] }],
		["secondary", { key: "secondary", label: getWeaponBankLabel("secondary"), description: bankDescriptions.secondary, items: [] }],
		["tertiary", { key: "tertiary", label: getWeaponBankLabel("tertiary"), description: bankDescriptions.tertiary, items: [] }],
		["quaternary", { key: "quaternary", label: getWeaponBankLabel("quaternary"), description: bankDescriptions.quaternary, items: [] }],
		["other", { key: "other", label: getWeaponBankLabel("other"), description: bankDescriptions.other, items: [] }]
	]);

	for ( const item of actor.items ) {
		const pack = getCompendiumPack(item);
		if ( pack !== "starshipweapons" ) continue;
		const bankKey = getWeaponBankKey(item);
		banks.get(bankKey)?.items.push(item);
	}

	return Array.from(banks.values())
		.map(section => ({
			...section,
			count: section.items.length,
			browsePack: "starshipweapons",
			supportsSheetNavigation,
			showDelete: true,
			defaultTab: STOCK_CARGO_TAB_ID,
			items: section.items
				.map(item => makeWeaponConsoleEntry(item, STOCK_CARGO_TAB_ID))
				.sort((left, right) => left.name.localeCompare(right.name))
		}))
		.filter(section => section.count > 0);
}

function makeCrewStations(actor) {
	const legacySystem = getLegacyStarshipSystem(actor);
	const deployment = legacySystem.attributes?.deployment ?? {};
	const pilotValue = deployment.pilot?.value ?? null;
	const activeValue = deployment.active?.value ?? null;
	const crewItems = Array.isArray(deployment.crew?.items) ? deployment.crew.items : [];
	const passengerItems = Array.isArray(deployment.passenger?.items) ? deployment.passenger.items : [];

	const stations = [
		{
			key: "pilot",
			label: "Pilot",
			note: "Helm control and maneuver authority",
			capacity: "1",
			assignments: pilotValue ? [pilotValue] : []
		},
		{
			key: "crew",
			label: "Crew Stations",
			note: "Active operators and bridge specialists",
			capacity: formatCapacityValue(actor, "crew"),
			assignments: crewItems
		},
		{
			key: "passenger",
			label: "Passengers",
			note: "Non-crew occupants aboard the vessel",
			capacity: formatCapacityValue(actor, "passengers"),
			assignments: passengerItems
		}
	];

	return stations.map(station => ({
		...station,
		count: station.assignments.length,
		entries: station.assignments.length
			? station.assignments.map(uuid => ({
				uuid,
				name: lookupDocumentName(uuid),
				isPilot: pilotValue === uuid,
				isActive: activeValue === uuid
			}))
			: []
	}));
}

function makeCrewRoleGroups(actor, { supportsSheetNavigation=false }={}) {
	const categories = {
		deployments: {
			key: "deployments",
			label: "Deployments",
			description: "Station roles and deployment items that define where crew members serve on the ship.",
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID,
			browsePack: "deployments"
		},
		maneuvers: {
			key: "maneuvers",
			label: "Crew Maneuvers",
			description: "Deployment feature items that represent role-specific bridge actions and tactical support.",
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID,
			browsePack: "deploymentfeatures"
		},
		ventures: {
			key: "ventures",
			label: "Ventures",
			description: "Specialized venture features that expand what the crew can accomplish in the field.",
			items: [],
			defaultTab: STOCK_CARGO_TAB_ID,
			browsePack: "ventures"
		}
	};

	for ( const item of actor.items ) {
		const pack = getCompendiumPack(item);
		const featType = item.system?.type?.value;
		if ( featType === "deployment" || pack === "deployments" ) categories.deployments.items.push(item);
		else if ( pack === "deploymentfeatures" ) categories.maneuvers.items.push(item);
		else if ( pack === "ventures" ) categories.ventures.items.push(item);
	}

	return presentStarshipGroups(
		Object.values(categories)
			.map(group => ({
				...group,
				count: group.items.length,
				manageLabel: localizeOrFallback("DND5E.VEHICLE.Tabs.Cargo", "Cargo"),
				items: group.items.map(item => makeItemEntry(item, group.defaultTab))
			}))
			.filter(group => group.count > 0),
		{ supportsSheetNavigation, showDelete: true }
	);
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
	if ( getShieldState(actor).max > 0 ) {
		notes.push(localizeOrFallback("SW5E.ShieldPoints", "Shield sync active"));
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

function makeWorkspaceActions({ integrated=false }={}) {
	const actions = [
		{ id: STARSHIP_TAB_ID, label: "Bridge" },
		{ id: STARSHIP_FEATURES_TAB_ID, label: "Systems" },
		{ id: STARSHIP_CREW_TAB_ID, label: "Crew" },
		{ id: STARSHIP_WEAPONS_TAB_ID, label: "Weapons" }
	];
	if ( integrated ) {
		actions.push(
			{ id: STOCK_CARGO_TAB_ID, label: localizeOrFallback("DND5E.VEHICLE.Tabs.Cargo", "Cargo") },
			{ id: "description", label: localizeOrFallback("DND5E.Description", "Description") },
			{ id: "effects", label: localizeOrFallback("DND5E.Effects", "Effects") }
		);
	}
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

function openCompendiumPack(packId) {
	if ( !packId ) return;
	const pack = game.packs?.get(`sw5e-module.${packId}`)
		?? game.packs?.find(entry => entry.collection?.endsWith(`.${packId}`));

	if ( !pack ) {
		ui.notifications.warn(`Could not find the ${packId} compendium pack.`);
		return;
	}

	pack.render(true);
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

	const bridgeActions = makeWorkspaceActions({ integrated });
	const summaryCards = makeSummaryCards(actor);
	const statusEntries = makeBridgeStatusEntries(actor);
	const logisticsEntries = makeBridgeLogisticsEntries(actor);
	const powerRouting = makePowerRoutingData(actor);
	const bridgeGroups = makeBridgeQuickGroups(actor, { supportsSheetNavigation: integrated });
	const systemsGroups = makeSystemsGroups(actor, { supportsSheetNavigation: integrated });
	const crewStations = makeCrewStations(actor);
	const crewGroups = makeCrewRoleGroups(actor, { supportsSheetNavigation: integrated });
	const weaponSections = makeWeaponsConsoleSections(actor, { supportsSheetNavigation: integrated });

	const [rendered, renderedSystems, renderedCrew, renderedWeapons] = await Promise.all([
		foundry.applications.handlebars.renderTemplate(getModulePath("templates/starship-sheet-layer.hbs"), {
			actorName: actor.name,
			actorImage: actor.img,
			title: "Bridge",
			subtitle: "Command status, operational routing, and quick access to the ship's most important systems.",
			headerBadges: makeHeaderBadges(actor),
			bridgeActions,
			summaryCards,
			statusEntries,
			logisticsEntries,
			powerRouting,
			isEditable: app.isEditable,
			quickGroups: bridgeGroups,
			legacyNotes: getLegacyNotes(actor)
		}),
		foundry.applications.handlebars.renderTemplate(getModulePath("templates/starship-features-layer.hbs"), {
			title: "Systems",
			subtitle: "Review the ship's installed systems, weapons, roles, and preserved conversion data in one place.",
			bridgeActions,
			groups: systemsGroups
		}),
		foundry.applications.handlebars.renderTemplate(getModulePath("templates/starship-crew-layer.hbs"), {
			title: "Crew",
			subtitle: "Manage bridge stations, assigned crew, and deployment features with a station-first layout.",
			bridgeActions,
			stations: crewStations,
			groups: crewGroups
		}),
		foundry.applications.handlebars.renderTemplate(getModulePath("templates/starship-weapons-layer.hbs"), {
			title: "Weapons",
			subtitle: "Tactical weapon banks with firing-first interactions and compact combat telemetry.",
			bridgeActions,
			sections: weaponSections
		})
	]);

	const tabButton = document.createElement("button");
	tabButton.type = "button";
	tabButton.className = "item sw5e-starship-tab-button";
	tabButton.dataset.group = "primary";
	tabButton.dataset.tab = STARSHIP_TAB_ID;
	tabButton.textContent = "Bridge";

	const featuresTabButton = document.createElement("button");
	featuresTabButton.type = "button";
	featuresTabButton.className = "item sw5e-starship-tab-button sw5e-starship-features-tab-button";
	featuresTabButton.dataset.group = "primary";
	featuresTabButton.dataset.tab = STARSHIP_FEATURES_TAB_ID;
	featuresTabButton.textContent = "Systems";

	const crewTabButton = document.createElement("button");
	crewTabButton.type = "button";
	crewTabButton.className = "item sw5e-starship-tab-button sw5e-starship-crew-tab-button";
	crewTabButton.dataset.group = "primary";
	crewTabButton.dataset.tab = STARSHIP_CREW_TAB_ID;
	crewTabButton.textContent = "Crew";

	const weaponsTabButton = document.createElement("button");
	weaponsTabButton.type = "button";
	weaponsTabButton.className = "item sw5e-starship-tab-button sw5e-starship-weapons-tab-button";
	weaponsTabButton.dataset.group = "primary";
	weaponsTabButton.dataset.tab = STARSHIP_WEAPONS_TAB_ID;
	weaponsTabButton.textContent = "Weapons";

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
	featuresWrapper.innerHTML = renderedSystems;
	featuresWrapper.hidden = getStarshipActiveTab(app) !== STARSHIP_FEATURES_TAB_ID;
	if ( getStarshipActiveTab(app) === STARSHIP_FEATURES_TAB_ID ) featuresWrapper.classList.add("active");

	const crewWrapper = document.createElement("section");
	crewWrapper.className = "tab sw5e-starship-tab sw5e-starship-crew-tab";
	crewWrapper.dataset.group = "primary";
	crewWrapper.dataset.tab = STARSHIP_CREW_TAB_ID;
	crewWrapper.innerHTML = renderedCrew;
	crewWrapper.hidden = getStarshipActiveTab(app) !== STARSHIP_CREW_TAB_ID;
	if ( getStarshipActiveTab(app) === STARSHIP_CREW_TAB_ID ) crewWrapper.classList.add("active");

	const weaponsWrapper = document.createElement("section");
	weaponsWrapper.className = "tab sw5e-starship-tab sw5e-starship-weapons-tab";
	weaponsWrapper.dataset.group = "primary";
	weaponsWrapper.dataset.tab = STARSHIP_WEAPONS_TAB_ID;
	weaponsWrapper.innerHTML = renderedWeapons;
	weaponsWrapper.hidden = getStarshipActiveTab(app) !== STARSHIP_WEAPONS_TAB_ID;
	if ( getStarshipActiveTab(app) === STARSHIP_WEAPONS_TAB_ID ) weaponsWrapper.classList.add("active");

	nav.append(tabButton);
	nav.append(featuresTabButton);
	nav.append(crewTabButton);
	nav.append(weaponsTabButton);
	panelParent.append(wrapper);
	panelParent.append(featuresWrapper);
	panelParent.append(crewWrapper);
	panelParent.append(weaponsWrapper);

	tabButton.addEventListener("click", event => {
		event.preventDefault();
		activateSheetTab(root, app, STARSHIP_TAB_ID);
	});

	featuresTabButton.addEventListener("click", event => {
		event.preventDefault();
		activateSheetTab(root, app, STARSHIP_FEATURES_TAB_ID);
	});

	crewTabButton.addEventListener("click", event => {
		event.preventDefault();
		activateSheetTab(root, app, STARSHIP_CREW_TAB_ID);
	});

	weaponsTabButton.addEventListener("click", event => {
		event.preventDefault();
		activateSheetTab(root, app, STARSHIP_WEAPONS_TAB_ID);
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
			return;
		}

		if ( action === "open-pack" ) {
			openCompendiumPack(actionNode.dataset.pack);
			return;
		}

		if ( action === "set-power-routing" ) {
			await updateStarshipPowerRouting(actor, actionNode.dataset.routing);
		}
	};

	const handleTabChange = async event => {
		const routeSlider = event.target.closest("[data-sw5e-power-route]");
		if ( routeSlider ) {
			event.preventDefault();
			await updateStarshipPowerRoutingFromSlider(actor, routeSlider.dataset.sw5ePowerRoute, routeSlider.value);
			return;
		}

		const slotInput = event.target.closest("[data-sw5e-power-slot]");
		if ( slotInput ) {
			event.preventDefault();
			await updateStarshipPowerSlot(actor, slotInput.dataset.sw5ePowerSlot, slotInput.value);
		}
	};

	wrapper.addEventListener("click", handleTabClick);
	wrapper.addEventListener("change", handleTabChange);
	featuresWrapper.addEventListener("click", handleTabClick);
	crewWrapper.addEventListener("click", handleTabClick);
	weaponsWrapper.addEventListener("click", handleTabClick);

	if ( integrated ) {
		nav.querySelectorAll(".item[data-tab]").forEach(item => {
			if ( item === tabButton || item === featuresTabButton || item === crewTabButton || item === weaponsTabButton ) return;
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
