import { DroidCustomizationsApp } from "../droid-customizations-app.mjs";
import {
	isActorDroidCustomizationsManagerAllowed,
	normalizeActorDroidCustomizations
} from "../droid-customizations.mjs";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {ReturnType<typeof normalizeActorDroidCustomizations>} state
 */
function buildInlineDroidCustomizationsSection(actor, state) {
	const cap = state.derived.capacity;
	const counts = state.derived.counts;
	const motorUsed = cap.motorUsed;
	const motorTotal = state.motorSlots;
	const installedN = counts.total;
	const partsLine = `${counts.parts} / ${cap.partsAllowed}`;
	const protLine = `${counts.protocols} / ${cap.protocolsAllowed}`;
	const policyBits = [];
	if ( cap.partsPolicy === "fallback-highest" ) {
		policyBits.push(game.i18n.localize("SW5E.DroidCustomizations.InlinePartsFallback"));
	}
	if ( cap.protocolsPolicy === "fallback-highest" ) {
		policyBits.push(game.i18n.localize("SW5E.DroidCustomizations.InlineProtocolsFallback"));
	}
	const policyHint = policyBits.length
		? `<p class="sw5e-droid-inline-policy subdued">${policyBits.map(t => foundry.utils.escapeHTML(t)).join(" · ")}</p>`
		: "";

	const wrap = document.createElement("div");
	wrap.className = "sw5e-droid-customizations-inline";
	wrap.innerHTML = `
		<h3 class="sw5e-droid-inline-title">
			<i class="fas fa-robot" inert aria-hidden="true"></i>
			<span class="roboto-upper">${game.i18n.localize("SW5E.DroidCustomizations.InlineTitle")}</span>
		</h3>
		<p class="sw5e-droid-inline-line"><strong>${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.InlineMotorLabel"))}</strong> ${motorUsed} / ${motorTotal}</p>
		<p class="sw5e-droid-inline-line"><strong>${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.InlineInstalledCount"))}</strong> ${installedN}</p>
		<p class="sw5e-droid-inline-line"><strong>${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.InlineParts"))}</strong> ${foundry.utils.escapeHTML(partsLine)}</p>
		<p class="sw5e-droid-inline-line"><strong>${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.InlineProtocols"))}</strong> ${foundry.utils.escapeHTML(protLine)}</p>
		${policyHint}
		<p class="sw5e-droid-inline-manage">
			<button type="button" class="unbutton sw5e-droid-inline-manage-btn" data-sw5e-droid-open-manager>
				${game.i18n.localize("SW5E.DroidCustomizations.InlineManage")}
			</button>
		</p>
	`;
	wrap.querySelector("[data-sw5e-droid-open-manager]")?.addEventListener("click", e => {
		e.preventDefault();
		DroidCustomizationsApp.openForActor(actor);
	});
	return wrap;
}

/**
 * Same mount targets as cybernetic augmentations: details `.right` (character) or NPC `.sidebar`, before Senses / DR pills.
 */
function insertDroidSectionIntoSheetBody(root, actor, section) {
	if ( actor.type === "character" ) {
		const details = root.querySelector("section.tab[data-tab=\"details\"]");
		const right = details?.querySelector(".right");
		if ( !right ) return false;
		const mountBefore = right.querySelector("button[data-config=\"senses\"]")?.closest(".pills-group")
			?? right.querySelector("button[data-trait=\"dr\"]")?.closest(".pills-group");
		const aug = right.querySelector(".sw5e-augmentations-inline");
		if ( aug ) {
			aug.insertAdjacentElement("afterend", section);
			return true;
		}
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
		const aug = sidebar.querySelector(".sw5e-augmentations-inline");
		if ( aug ) {
			aug.insertAdjacentElement("afterend", section);
			return true;
		}
		if ( mountBefore ) sidebar.insertBefore(section, mountBefore);
		else sidebar.appendChild(section);
		return true;
	}
	return false;
}

function injectDroidCustomizationsBodySection(app, html) {
	const actor = app.actor ?? app.document;
	if ( !actor || (actor.type !== "character" && actor.type !== "npc") ) return;
	if ( !isActorDroidCustomizationsManagerAllowed(actor) ) return;

	const root = getHtmlRoot(html);
	if ( !root ) return;

	root.querySelectorAll(".sw5e-droid-customizations-inline").forEach(n => n.remove());

	const canSee = actor.testUserPermission(game.user, "OBSERVER", { exact: false });
	if ( !canSee ) return;

	const state = normalizeActorDroidCustomizations(actor);

	const section = buildInlineDroidCustomizationsSection(actor, state);
	insertDroidSectionIntoSheetBody(root, actor, section);
}

export function patchDroidCustomizationsSheet() {
	Hooks.on("renderActorSheetV2", injectDroidCustomizationsBodySection);
}
