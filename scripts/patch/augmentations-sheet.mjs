import { AugmentationsApp } from "../augmentations-app.mjs";
import {
	collectOccupiedBodySlots,
	getMaxAugmentationsForActor,
	getInstalledAugmentationCount,
	isActorAugmentationCandidate,
	isActorValidAugmentationTarget,
	isLegacyStarshipActor,
	normalizeActorAugmentations
} from "../augmentations.mjs";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

/**
 * dnd5e 5.2.x actor sheets use `constructor.MODES.PLAY` / `EDIT` and `app._mode`.
 * @param {object} app
 */
function isActorSheetEditMode(app) {
	const MODES = app?.constructor?.MODES;
	if ( MODES && ("EDIT" in MODES) && ("PLAY" in MODES) ) return app._mode === MODES.EDIT;
	return Boolean(app?.isEditable);
}

function hasActiveEffectiveSideEffects(eff) {
	return Boolean(eff?.ionSaveDisadvantage || eff?.ionVulnerability || eff?.countAsDroid);
}

function effectiveSideEffectSummaryLines(eff) {
	const lines = [];
	if ( eff?.ionSaveDisadvantage ) lines.push(game.i18n.localize("SW5E.Augmentations.InlineFxIonSaves"));
	if ( eff?.ionVulnerability ) lines.push(game.i18n.localize("SW5E.Augmentations.InlineFxIonVuln"));
	if ( eff?.countAsDroid ) lines.push(game.i18n.localize("SW5E.Augmentations.InlineFxDroid"));
	return lines;
}

function hasSideEffectOverrides(state) {
	const o = state?.overrides?.sideEffects;
	if ( !o ) return false;
	return o.ionSaveDisadvantage !== null || o.ionVulnerability !== null || o.countAsDroid !== null;
}

function effectiveDiffersFromDerived(state) {
	const d = state?.derived?.sideEffects;
	const e = state?.effective?.sideEffects;
	if ( !d || !e ) return false;
	return d.ionSaveDisadvantage !== e.ionSaveDisadvantage
		|| d.ionVulnerability !== e.ionVulnerability
		|| d.countAsDroid !== e.countAsDroid;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {ReturnType<typeof normalizeActorAugmentations>} state
 */
function buildInlineAugmentationsSection(actor, state) {
	const count = getInstalledAugmentationCount(actor, state);
	const max = getMaxAugmentationsForActor(actor, state);
	const eff = state.effective.sideEffects;
	const occupied = [...collectOccupiedBodySlots(state.installed)].sort();
	const slotsText = occupied.length
		? occupied.join(", ")
		: game.i18n.localize("SW5E.Augmentations.InlineNoSlots");

	const fxLines = effectiveSideEffectSummaryLines(eff);
	const fxBlock = hasActiveEffectiveSideEffects(eff)
		? fxLines.map(t => `<li>${foundry.utils.escapeHTML(t)}</li>`).join("")
		: `<li class="sw5e-aug-inline-fx-none">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.InlineFxNone"))}</li>`;

	const overrideNote = (hasSideEffectOverrides(state) || effectiveDiffersFromDerived(state))
		? `<p class="sw5e-aug-inline-override-hint">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.InlineOverridesHint"))}</p>`
		: "";

	const validTarget = isActorValidAugmentationTarget(actor);
	const targetHint = !validTarget
		? `<p class="sw5e-aug-inline-target-hint">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.InlineInvalidTargetHint"))}</p>`
		: "";

	const wrap = document.createElement("div");
	wrap.className = "sw5e-augmentations-inline";
	wrap.innerHTML = `
		<h3 class="sw5e-aug-inline-title">
			<i class="fas fa-microchip" inert aria-hidden="true"></i>
			<span class="roboto-upper">${game.i18n.localize("SW5E.Augmentations.InlineTitle")}</span>
		</h3>
		${targetHint}
		<p class="sw5e-aug-inline-count"><strong>${foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.InlineCount"))}</strong> ${count} / ${max}</p>
		<p class="sw5e-aug-inline-slots subdued">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.InlineSlotsLabel"))} ${foundry.utils.escapeHTML(slotsText)}</p>
		<ul class="sw5e-aug-inline-fx">${fxBlock}</ul>
		${overrideNote}
		<p class="sw5e-aug-inline-manage">
			<button type="button" class="unbutton sw5e-aug-inline-manage-btn" data-sw5e-aug-open-manager>
				${game.i18n.localize("SW5E.Augmentations.InlineManage")}
			</button>
		</p>
	`;
	wrap.querySelector("[data-sw5e-aug-open-manager]")?.addEventListener("click", e => {
		e.preventDefault();
		AugmentationsApp.openForActor(actor);
	});
	return wrap;
}

/**
 * Character details tab: `.right` column, after background (`.top.flexrow`), before Senses / Resistances pills.
 * NPC: `.sidebar`, before Senses / Resistances pills.
 */
function insertAugmentationsIntoSheetBody(root, actor, section) {
	if ( actor.type === "character" ) {
		const details = root.querySelector("section.tab[data-tab=\"details\"]");
		const right = details?.querySelector(".right");
		if ( !right ) return false;
		const mountBefore = right.querySelector("button[data-config=\"senses\"]")?.closest(".pills-group")
			?? right.querySelector("button[data-trait=\"dr\"]")?.closest(".pills-group");
		if ( mountBefore ) right.insertBefore(section, mountBefore);
		else {
			const top = right.querySelector(".top.flexrow");
			if ( top ) top.insertAdjacentElement("afterend", section);
			else right.prepend(section);
		}
		return true;
	}
	if ( actor.type === "npc" ) {
		const sidebar = root.querySelector(".sidebar");
		if ( !sidebar ) return false;
		const mountBefore = sidebar.querySelector("button[data-config=\"senses\"]")?.closest(".pills-group")
			?? sidebar.querySelector("button[data-trait=\"dr\"]")?.closest(".pills-group");
		if ( mountBefore ) sidebar.insertBefore(section, mountBefore);
		else sidebar.appendChild(section);
		return true;
	}
	return false;
}

function injectAugmentationsBodySection(app, html) {
	const actor = app.actor ?? app.document;
	if ( !actor || (actor.type !== "character" && actor.type !== "npc") ) return;
	if ( actor.type === "vehicle" || isLegacyStarshipActor(actor) ) return;
	if ( !isActorAugmentationCandidate(actor) ) return;

	const root = getHtmlRoot(html);
	if ( !root ) return;

	root.querySelectorAll(".sw5e-augmentations-inline").forEach(n => n.remove());

	const canSee = actor.testUserPermission(game.user, "OBSERVER", { exact: false });
	if ( !canSee ) return;

	const editMode = isActorSheetEditMode(app);
	const state = normalizeActorAugmentations(actor);
	const installedCount = state.installed.length;

	if ( !editMode && installedCount === 0 ) return;

	const section = buildInlineAugmentationsSection(actor, state);
	insertAugmentationsIntoSheetBody(root, actor, section);
}

export function patchAugmentationsSheet() {
	Hooks.on("renderActorSheetV2", injectAugmentationsBodySection);
}
