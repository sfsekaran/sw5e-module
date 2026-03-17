import { getModuleId, getModulePath } from "../module-support.mjs";
import {
	buildStarshipItemGroups,
	buildStarshipSkillEntries,
	getStarshipCharacterFlag,
	getStarshipCharacterSheetClassId,
	getStarshipClassification,
	isStarshipCharacterActor
} from "../starship-character.mjs";

const STARSHIP_TAB_ID = "sw5e-starship";
const STARSHIP_TEMPLATE_PATH = getModulePath("templates/starship-character-sheet.hbs");

function getCharacterSheetBaseClass() {
	return game.dnd5e?.applications?.actor?.CharacterActorSheet;
}

function getSheetRoot(element, app) {
	return element instanceof HTMLElement ? element : element?.[0] ?? app.element;
}

function getTabsNav(root) {
	return root.querySelector('nav.tabs[data-group="primary"]')
		?? root.querySelector('.tabs[data-group="primary"]');
}

function getTabBody(root) {
	return root.querySelector('#tabs.tab-body')
		?? root.querySelector('.tab-body#tabs')
		?? root.querySelector('[id="tabs"].tab-body');
}

function formatSizeLabel(size) {
	const config = CONFIG.DND5E.actorSizes?.[size];
	if ( typeof config === "string" ) return game.i18n.localize(config);
	if ( config?.label ) return game.i18n.localize(config.label);
	return size ?? "";
}

function formatPowerAllocations(power = {}) {
	const labels = {
		central: "Central",
		comms: "Comms",
		engines: "Engines",
		sensors: "Sensors",
		shields: "Shields",
		weapons: "Weapons"
	};
	return ["central", "engines", "shields", "weapons", "sensors", "comms"]
		.map(key => ({
			key,
			label: labels[key] ?? key,
			value: Number(power[key]?.value ?? 0)
		}))
		.filter(entry => entry.value || entry.key === "central");
}

function buildGroupEntries(actor) {
	const groups = buildStarshipItemGroups(actor);
	return [
		{ id: "classification", label: "Classification", items: groups.classification },
		{ id: "systems", label: "Systems", items: groups.systems },
		{ id: "weapons", label: "Weapons", items: groups.weapons },
		{ id: "actions", label: "Actions", items: groups.actions },
		{ id: "features", label: "Features", items: groups.features },
		{ id: "modifications", label: "Modifications", items: groups.modifications },
		{ id: "deployments", label: "Deployments", items: groups.deployments }
	].map(group => ({
		...group,
		items: group.items.map(item => ({
			id: item.id ?? item._id,
			img: item.img,
			name: item.name,
			typeLabel: item.system?.type?.subtype ?? item.system?.type?.value ?? item.type,
			description: item.system?.description?.value ?? ""
		}))
	})).filter(group => group.items.length);
}

function buildTemplateContext(actor) {
	const starship = getStarshipCharacterFlag(actor) ?? {};
	const classification = getStarshipClassification(actor) ?? {};
	const resources = starship.resources ?? {};
	const hp = actor.system.attributes?.hp ?? {};
	const source = starship.details?.source?.custom ?? actor.system.details?.source?.custom ?? "";

	return {
		actor,
		classification: {
			name: classification.name ?? "Unclassified Starship",
			size: formatSizeLabel(classification.size),
			tier: classification.tier ?? 0,
			identifier: classification.identifier ?? ""
		},
		summary: {
			hull: {
				value: Number(hp.value ?? 0),
				max: Number(hp.max ?? 0),
				die: resources.hullDice?.die ?? classification.hullDice ?? ""
			},
			shields: {
				value: Number(hp.temp ?? 0),
				max: Number(hp.tempmax ?? 0),
				die: resources.shieldDice?.die ?? classification.shldDice ?? ""
			},
			fuel: {
				value: Number(resources.fuel?.value ?? 0),
				cap: Number(resources.fuel?.fuelCap ?? classification.fuelCap ?? 0)
			},
			power: {
				routing: resources.power?.routing ?? "none",
				allocations: formatPowerAllocations(resources.power)
			},
			deployment: {
				pilotAssigned: resources.crewSummary?.pilotAssigned ?? false,
				crewCount: Number(resources.crewSummary?.crewCount ?? 0),
				passengerCount: Number(resources.crewSummary?.passengerCount ?? 0)
			},
			systemDamage: Number(resources.systemDamage ?? 0)
		},
		source,
		skills: buildStarshipSkillEntries(actor),
		itemGroups: buildGroupEntries(actor)
	};
}

function activateStarshipTab(root) {
	const nav = getTabsNav(root);
	const body = getTabBody(root);
	if ( !nav || !body ) return;

	for (const tab of nav.querySelectorAll("[data-group='primary'][data-tab]")) {
		tab.classList.toggle("active", tab.dataset.tab === STARSHIP_TAB_ID);
	}
	for (const tab of body.querySelectorAll("[data-group='primary'][data-tab]")) {
		const isActive = tab.dataset.tab === STARSHIP_TAB_ID;
		tab.classList.toggle("active", isActive);
		tab.style.display = isActive ? "" : "none";
	}
}

function bindTabButton(root) {
	const button = root.querySelector(`.item[data-tab="${STARSHIP_TAB_ID}"], button[data-tab="${STARSHIP_TAB_ID}"]`);
	if ( !button || button.dataset.sw5eBound ) return;
	button.dataset.sw5eBound = "true";
	button.addEventListener("click", event => {
		event.preventDefault();
		activateStarshipTab(root);
	});
}

function bindItemInteractions(root, actor) {
	for (const button of root.querySelectorAll("[data-sw5e-open-item]")) {
		if ( button.dataset.sw5eBound ) continue;
		button.dataset.sw5eBound = "true";
		button.addEventListener("click", event => {
			event.preventDefault();
			const item = actor.items.get(button.dataset.itemId);
			item?.sheet?.render(true);
		});
	}
}

async function renderStarshipTab(app, element) {
	const root = getSheetRoot(element, app);
	if ( !root || !isStarshipCharacterActor(app.actor) ) return;
	root.classList.add("sw5e-starship-character-sheet");

	const nav = getTabsNav(root);
	const body = getTabBody(root);
	if ( !nav || !body ) return;

	let button = nav.querySelector(`[data-tab="${STARSHIP_TAB_ID}"]`);
	if ( !button ) {
		button = document.createElement("a");
		button.className = "item";
		button.dataset.group = "primary";
		button.dataset.tab = STARSHIP_TAB_ID;
		button.textContent = "Starship";
		nav.prepend(button);
	}

	const existingTab = body.querySelector(`[data-tab="${STARSHIP_TAB_ID}"]`);
	if ( existingTab ) existingTab.remove();

	const html = await foundry.applications.handlebars.renderTemplate(STARSHIP_TEMPLATE_PATH, buildTemplateContext(app.actor));
	body.insertAdjacentHTML("afterbegin", html);

	if ( !app._sw5eStarshipTabInitialized ) {
		app._sw5eStarshipTabInitialized = true;
		activateStarshipTab(root);
	}

	bindTabButton(root);
	bindItemInteractions(root, app.actor);
}

export function patchStarshipCharacterSheet() {
	const CharacterActorSheet = getCharacterSheetBaseClass();
	if ( !CharacterActorSheet ) return;

	class Sw5eStarshipCharacterSheet extends CharacterActorSheet {
		static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
			classes: [...super.DEFAULT_OPTIONS.classes, "sw5e-starship-character"],
			position: {
				width: 920,
				height: 980
			}
		});
	}

	foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, getModuleId(), Sw5eStarshipCharacterSheet, {
		types: ["character"],
		makeDefault: false,
		label: "SW5E Starship"
	});

	Hooks.on("renderActorSheetV2", (app, element) => {
		if ( !(app instanceof Sw5eStarshipCharacterSheet) ) return;
		void renderStarshipTab(app, element);
	});
}

export { getStarshipCharacterSheetClassId };
