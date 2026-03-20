import { getModuleId, getModulePath } from "../module-support.mjs";
import {
	buildAvailableStarshipCrewChoices,
	deployStarshipCrew,
	buildStarshipRuntime,
	buildStarshipItemGroups,
	buildStarshipSkillEntries,
	getStarshipCharacterFlag,
	getStarshipCharacterSheetClassId,
	getStarshipClassification,
	isStarshipCharacterActor,
	toggleStarshipActiveCrew,
	undeployStarshipCrew
} from "../starship-character.mjs";

const STARSHIP_TAB_ID = "sw5e-starship";
const STARSHIP_TEMPLATE_PATH = getModulePath("templates/starship-character-sheet.hbs");

function getCharacterSheetBaseClass() {
	return game.dnd5e?.applications?.actor?.CharacterActorSheet;
}

function getRenderableElement(element, app) {
	if ( element instanceof HTMLElement ) return element;
	if ( element?.[0] instanceof HTMLElement ) return element[0];
	if ( app.element instanceof HTMLElement ) return app.element;
	if ( app.element?.[0] instanceof HTMLElement ) return app.element[0];
	return null;
}

function getSheetRoot(element, app) {
	const candidate = getRenderableElement(element, app);
	if ( !candidate ) return null;

	return candidate.closest(".dnd5e2.sheet.actor")
		?? candidate.closest(".dnd5e.sheet.actor")
		?? candidate.closest("form.application")
		?? candidate;
}

function getTabsNav(root) {
	if ( !root ) return null;
	const tabControl = root.querySelector("[data-application-part='tabs'] nav.tabs[data-group='primary']")
		?? root.querySelector("nav.tabs[data-group='primary']")
		?? root.querySelector("nav[data-group='primary']");
	if ( tabControl ) return tabControl;

	const tabItem = root.querySelector("[data-group='primary'][data-action='tab'][data-tab]")
		?? root.querySelector("[data-group='primary'][data-tab]");
	return tabItem?.closest("nav") ?? null;
}

function getTabBody(root) {
	if ( !root ) return null;
	return root.querySelector(".tab-body#tabs")
		?? root.querySelector("#tabs.tab-body")
		?? root.querySelector("[id='tabs'].tab-body")
		?? root.querySelector(".sheet-body .tab-body")
		?? root.querySelector(".tab[data-group='primary'][data-tab]")?.parentElement
		?? null;
}

function getActivePrimaryTab(root) {
	const nav = getTabsNav(root);
	const body = getTabBody(root);
	return nav?.querySelector("[data-group='primary'][data-tab].active")?.dataset.tab
		?? body?.querySelector("[data-group='primary'][data-tab].active")?.dataset.tab
		?? root?.className?.match(/\btab-([\w-]+)\b/)?.[1]
		?? null;
}

function syncPrimaryTabState(root, activeTab) {
	if ( !activeTab ) return;
	const nav = getTabsNav(root);
	const body = getTabBody(root);
	if ( !nav || !body ) return;

	for (const tab of nav.querySelectorAll("[data-group='primary'][data-tab]")) {
		tab.classList.toggle("active", tab.dataset.tab === activeTab);
	}
	for (const tab of body.querySelectorAll("[data-group='primary'][data-tab]")) {
		tab.classList.toggle("active", tab.dataset.tab === activeTab);
	}
}

function createRenderedElement(html) {
	const template = document.createElement("template");
	template.innerHTML = html.trim();
	return template.content.firstElementChild;
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

function buildNativeStarshipSourceSkills(actor) {
	const flagSkills = getStarshipCharacterFlag(actor)?.skills ?? {};
	const configSkills = CONFIG.DND5E.starshipSkills ?? {};
	const sourceSkills = {};

	for (const [key, config] of Object.entries(configSkills)) {
		const source = flagSkills[key] ?? {};
		sourceSkills[key] = {
			ability: source.ability ?? config.ability ?? "int",
			value: Number(source.value ?? 0),
			bonuses: {
				check: source.bonuses?.check ?? "",
				passive: source.bonuses?.passive ?? ""
			}
		};
	}

	return sourceSkills;
}

function buildNativeStarshipSkills(actor) {
	const existingSkills = actor.system?.skills ?? {};
	const skills = {};

	for (const skill of buildStarshipSkillEntries(actor)) {
		const existing = existingSkills[skill.key] ?? {};
		const total = Number(skill.total ?? 0);
		const value = Number(skill.proficiency ?? 0);
		skills[skill.key] = {
			...existing,
			ability: skill.ability,
			value,
			baseValue: value,
			mod: total,
			passive: 10 + total,
			total,
			bonuses: {
				check: existing.bonuses?.check ?? "",
				passive: existing.bonuses?.passive ?? ""
			}
		};
	}

	return skills;
}

function applyStarshipSkillContext(context, actor) {
	context.config ??= {};
	context.system ??= {};
	context.source ??= {};
	context.system.skills = buildNativeStarshipSkills(actor);
	context.source.skills = buildNativeStarshipSourceSkills(actor);
	context.config.skills = foundry.utils.deepClone(CONFIG.DND5E.starshipSkills ?? {});
	return context;
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

function buildCrewContext(actor, runtime) {
	const resolvedCrew = runtime?.crew ?? {};
	const roster = Array.isArray(resolvedCrew.roster) ? resolvedCrew.roster : [];
	const rosterUuids = new Set(roster.map(member => member.uuid));
	const availableActors = buildAvailableStarshipCrewChoices(actor)
		.filter(entry => !rosterUuids.has(entry.uuid));

	return {
		roster,
		availableActors,
		actions: Array.isArray(resolvedCrew.actions) ? resolvedCrew.actions : []
	};
}

function buildTemplateContext(actor) {
	const starship = getStarshipCharacterFlag(actor) ?? {};
	const classification = getStarshipClassification(actor) ?? {};
	const runtime = buildStarshipRuntime(actor);
	const resources = starship.resources ?? {};
	const hp = actor.system.attributes?.hp ?? {};
	const liveAttributes = runtime?.attributes ?? actor.system.attributes ?? {};
	const liveClassification = runtime?.classification ?? {};
	const crew = buildCrewContext(actor, runtime);
	const source = starship.details?.source?.custom ?? actor.system.details?.source?.custom ?? "";

	return {
		actor,
		classification: {
			name: liveClassification.name ?? classification.name ?? "Unclassified Starship",
			size: formatSizeLabel(liveClassification.size ?? classification.size),
			tier: liveClassification.tier ?? classification.tier ?? 0,
			identifier: liveClassification.identifier ?? classification.identifier ?? ""
		},
		summary: {
			hull: {
				value: Number(hp.value ?? 0),
				max: Number(hp.max ?? 0),
				die: liveAttributes.hull?.die ?? resources.hullDice?.die ?? classification.hullDice ?? ""
			},
			shields: {
				value: Number(hp.temp ?? 0),
				max: Number(hp.tempmax ?? 0),
				die: liveAttributes.shld?.die ?? resources.shieldDice?.die ?? classification.shldDice ?? ""
			},
			fuel: {
				value: Number(liveAttributes.fuel?.value ?? resources.fuel?.value ?? 0),
				cap: Number(liveAttributes.fuel?.fuelCap ?? resources.fuel?.fuelCap ?? classification.fuelCap ?? 0)
			},
			power: {
				routing: liveAttributes.power?.routing ?? resources.power?.routing ?? "none",
				allocations: formatPowerAllocations(liveAttributes.power ?? resources.power)
			},
			deployment: {
				pilotAssigned: liveAttributes.crewSummary?.pilotAssigned ?? resources.crewSummary?.pilotAssigned ?? false,
				crewCount: Number(liveAttributes.crewSummary?.crewCount ?? resources.crewSummary?.crewCount ?? 0),
				passengerCount: Number(liveAttributes.crewSummary?.passengerCount ?? resources.crewSummary?.passengerCount ?? 0)
			},
			systemDamage: Number(liveAttributes.systemDamage ?? resources.systemDamage ?? 0)
		},
		source,
		crew,
		itemGroups: buildGroupEntries(actor)
	};
}

function bindPrimaryTabTracking(root, app) {
	const nav = getTabsNav(root);
	if ( !nav ) return;

	for (const tab of nav.querySelectorAll("[data-group='primary'][data-tab]")) {
		if ( tab.dataset.sw5eTrackBound ) continue;
		tab.dataset.sw5eTrackBound = "true";
		tab.addEventListener("click", () => {
			app._sw5ePrimaryActiveTab = tab.dataset.tab ?? null;
		});
	}
}

function bindStarshipTabButton(root, app) {
	const button = root.querySelector(`.item[data-tab="${STARSHIP_TAB_ID}"], button[data-tab="${STARSHIP_TAB_ID}"]`);
	if ( !button || button.dataset.sw5eBound ) return;
	button.dataset.sw5eBound = "true";
	button.addEventListener("click", event => {
		event.preventDefault();
		app._sw5ePrimaryActiveTab = STARSHIP_TAB_ID;
		syncPrimaryTabState(root, STARSHIP_TAB_ID);
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

function bindCrewItemInteractions(root) {
	for (const button of root.querySelectorAll("[data-sw5e-open-crew-item]")) {
		if ( button.dataset.sw5eBound ) continue;
		button.dataset.sw5eBound = "true";
		button.addEventListener("click", event => {
			event.preventDefault();
			const sourceActor = fromUuidSync(button.dataset.actorUuid ?? "");
			const item = sourceActor?.items?.get(button.dataset.itemId);
			item?.sheet?.render(true);
		});
	}
}

function bindCrewControls(root, actor) {
	for (const button of root.querySelectorAll("[data-sw5e-crew-command]")) {
		if ( button.dataset.sw5eBound ) continue;
		button.dataset.sw5eBound = "true";
		button.addEventListener("click", async event => {
			event.preventDefault();
			button.disabled = true;
			try {
				const command = button.dataset.sw5eCrewCommand;
				const actorUuid = button.dataset.actorUuid ?? "";
				if ( command === "deploy" ) {
					await deployStarshipCrew(actor, actorUuid, button.dataset.deployRole);
				} else if ( command === "remove" ) {
					await undeployStarshipCrew(actor, actorUuid);
				} else if ( command === "toggle-active" ) {
					await toggleStarshipActiveCrew(actor, actorUuid);
				} else if ( command === "toggle-pilot" ) {
					const isPilot = button.dataset.isPilot === "true";
					if ( isPilot ) await undeployStarshipCrew(actor, actorUuid, "pilot");
					else await deployStarshipCrew(actor, actorUuid, "pilot");
				}
			} catch (error) {
				console.error(error);
				ui.notifications?.error(error?.message ?? "Starship crew update failed.");
			} finally {
				button.disabled = false;
			}
		});
	}
}

async function renderStarshipTab(app, element) {
	const root = getSheetRoot(element, app);
	if ( !root || !isStarshipCharacterActor(app.actor) ) return;
	root.classList.add("sw5e-starship-character-sheet");

	const nav = getTabsNav(root);
	const body = getTabBody(root);
	if ( !body ) {
		console.warn("SW5E Starship tab injection skipped: primary tab body not found.", { actor: app.actor?.name });
		return;
	}
	const activeTab = app._sw5ePrimaryActiveTab ?? getActivePrimaryTab(root);

	let button = nav?.querySelector(`[data-tab="${STARSHIP_TAB_ID}"]`) ?? null;
	if ( nav && !button ) {
		button = document.createElement("a");
		button.className = "item control";
		button.dataset.action = "tab";
		button.dataset.group = "primary";
		button.dataset.tab = STARSHIP_TAB_ID;
		button.setAttribute("aria-label", "Starship");
		button.textContent = "Starship";
		nav.prepend(button);
	}

	const html = await foundry.applications.handlebars.renderTemplate(STARSHIP_TEMPLATE_PATH, buildTemplateContext(app.actor));
	const renderedTab = createRenderedElement(html);
	if ( !(renderedTab instanceof HTMLElement) ) return;

	const existingTab = body.querySelector(`[data-tab="${STARSHIP_TAB_ID}"]`);
	if ( existingTab instanceof HTMLElement ) {
		existingTab.className = renderedTab.className;
		existingTab.replaceChildren(...Array.from(renderedTab.childNodes));
	} else {
		body.insertAdjacentElement("afterbegin", renderedTab);
	}

	if ( nav ) {
		bindPrimaryTabTracking(root, app);
		bindStarshipTabButton(root, app);
		if ( activeTab ) syncPrimaryTabState(root, activeTab);
	}
	bindItemInteractions(root, app.actor);
	bindCrewItemInteractions(root);
	bindCrewControls(root, app.actor);
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

		async _prepareDetailsContext(context, options) {
			if ( isStarshipCharacterActor(this.actor) ) {
				context = applyStarshipSkillContext(context, this.actor);
			}

			context = await super._prepareDetailsContext(context, options);
			if ( !isStarshipCharacterActor(this.actor) ) return context;

			for (const [key, entry] of Object.entries(context.skills ?? {})) {
				entry.reference = CONFIG.DND5E.starshipSkills?.[key]?.reference ?? null;
			}

			return context;
		}

		_prepareSkillsTools(context, property) {
			if ( (property !== "skills") || !isStarshipCharacterActor(this.actor) ) {
				return super._prepareSkillsTools(context, property);
			}

			const baseAbility = key => {
				let sourceAbility = context.source[property]?.[key]?.ability;
				if ( sourceAbility ) return sourceAbility;
				sourceAbility = CONFIG.DND5E.starshipSkills?.[key]?.ability;
				if ( sourceAbility ) return sourceAbility;
				sourceAbility = CONFIG.DND5E.skills?.[key]?.ability;
				return sourceAbility ?? "int";
			};

			return Object.entries(context.system[property] ?? {})
				.map(([key, entry]) => {
					const labelKey = CONFIG.DND5E.starshipSkills?.[key]?.label
						?? CONFIG.DND5E.skills?.[key]?.label
						?? key;
					return {
						...entry,
						key,
						abbreviation: CONFIG.DND5E.abilities[entry.ability]?.abbreviation,
						baseAbility: baseAbility(key),
						hover: CONFIG.DND5E.proficiencyLevels[entry.value],
						label: game.i18n.localize(labelKey),
						source: context.source[property]?.[key]
					};
				})
				.sort((left, right) => (left.label ?? left.key).localeCompare(right.label ?? right.key, game.i18n.lang));
		}
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
