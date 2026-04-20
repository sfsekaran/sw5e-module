import { getModulePath } from "./module-support.mjs";
import {
	AUGMENTATION_SIDE_EFFECT_KEYS,
	addAugmentationToActor,
	collectOccupiedBodySlots,
	getAugmentationItemMeta,
	getMaxAugmentationsForActor,
	getInstalledAugmentationCount,
	isActorAugmentationCandidate,
	isActorValidAugmentationTarget,
	isLegacyStarshipActor,
	isValidAugmentationItemMeta,
	normalizeActorAugmentations,
	removeAugmentationFromActor,
	setAugmentationSideEffectOverride,
	validateAugmentationInstall,
	validateAugmentationRemove
} from "./augmentations.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DialogV2 = foundry.applications.api.DialogV2;

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function formatYesNo(value) {
	return value
		? localizeOrFallback("SW5E.Augmentations.Yes", "Yes")
		: localizeOrFallback("SW5E.Augmentations.No", "No");
}

function overrideModeText(mode) {
	if ( mode === "inherit" ) return localizeOrFallback("SW5E.Augmentations.OverrideInherit", "Use derived");
	if ( mode === "on" ) return localizeOrFallback("SW5E.Augmentations.OverrideOn", "Force on");
	return localizeOrFallback("SW5E.Augmentations.OverrideOff", "Force off");
}

const SIDE_EFFECT_LABEL_KEYS = Object.freeze({
	ionSaveDisadvantage: "SW5E.Augmentations.EffectIonSaves",
	ionVulnerability: "SW5E.Augmentations.EffectIonVulnerability",
	countAsDroid: "SW5E.Augmentations.EffectCountAsDroid"
});

function sideEffectLabel(key) {
	return localizeOrFallback(SIDE_EFFECT_LABEL_KEYS[key] ?? key, key);
}

async function collectAugmentationInstallChoices() {
	const choices = [];
	const seen = new Set();
	const worldLabel = localizeOrFallback("SW5E.Augmentations.SourceWorld", "World");

	const push = (uuid, name, sourceLabel) => {
		if ( !uuid || seen.has(uuid) ) return;
		seen.add(uuid);
		choices.push({ uuid, name, sourceLabel });
	};

	for ( const item of game.items ) {
		const meta = getAugmentationItemMeta(item);
		if ( !meta || !isValidAugmentationItemMeta(meta) ) continue;
		push(item.uuid, item.name, worldLabel);
	}

	for ( const pack of game.packs ) {
		if ( pack.documentName !== "Item" ) continue;
		try {
			const index = await pack.getIndex({ fields: ["flags.sw5e.augmentation", "name"] });
			for ( const row of index ) {
				if ( !row.flags?.sw5e?.augmentation ) continue;
				const uuid = pack.getUuid(row._id);
				push(uuid, row.name, pack.metadata.label);
			}
		} catch {
			/* locked / unavailable pack */
		}
	}

	choices.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
	return choices;
}

function formatValidationHtml(validation) {
	if ( !validation ) return "";
	const lines = [];
	if ( validation.blocking?.length ) {
		lines.push(`<p class="sw5e-aug-val-title sw5e-aug-val-blocking">${game.i18n.localize("SW5E.Augmentations.ValidationBlocking")}</p><ul>`);
		for ( const b of validation.blocking ) {
			lines.push(`<li>${foundry.utils.escapeHTML(b.message)}</li>`);
		}
		lines.push("</ul>");
	}
	if ( validation.warnings?.length ) {
		lines.push(`<p class="sw5e-aug-val-title sw5e-aug-val-warn">${game.i18n.localize("SW5E.Augmentations.ValidationWarnings")}</p><ul>`);
		for ( const w of validation.warnings ) {
			lines.push(`<li>${foundry.utils.escapeHTML(w.message)}</li>`);
		}
		lines.push("</ul>");
	}
	const info = validation.info;
	if ( info && typeof info === "object" ) {
		lines.push(`<p class="sw5e-aug-val-title">${game.i18n.localize("SW5E.Augmentations.ValidationInfo")}</p><dl class="sw5e-aug-info-dl">`);
		if ( info.actorTargetType != null ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoTargetType")}</dt><dd>${foundry.utils.escapeHTML(String(info.actorTargetType))}</dd>`);
		}
		if ( info.maxAugmentations != null ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoMax")}</dt><dd>${foundry.utils.escapeHTML(String(info.maxAugmentations))}</dd>`);
		}
		if ( info.currentAugmentations != null ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoCurrent")}</dt><dd>${foundry.utils.escapeHTML(String(info.currentAugmentations))}</dd>`);
		}
		if ( info.requiredTool ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoTool")}</dt><dd>${foundry.utils.escapeHTML(String(info.requiredTool))}</dd>`);
		}
		if ( info.installDC != null ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoDC")}</dt><dd>${foundry.utils.escapeHTML(String(info.installDC))}</dd>`);
		}
		if ( Array.isArray(info.occupiedBodySlots) && info.occupiedBodySlots.length ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoOccupiedSlots")}</dt><dd>${foundry.utils.escapeHTML(info.occupiedBodySlots.join(", "))}</dd>`);
		}
		if ( Array.isArray(info.proposedBodySlots) && info.proposedBodySlots.length ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoProposedSlots")}</dt><dd>${foundry.utils.escapeHTML(info.proposedBodySlots.join(", "))}</dd>`);
		}
		lines.push("</dl>");
	}
	return lines.join("\n");
}

export class AugmentationsApp extends HandlebarsApplicationMixin(ApplicationV2) {
	/** @param {{ actor: import("@league/foundry").documents.Actor }} opts */
	constructor({ actor } = {}) {
		if ( !actor?.id ) throw new Error("AugmentationsApp requires a persisted actor with an id.");
		super({ id: `sw5e-augmentations-${actor.id}` });
		this._actorId = actor.id;
		this.#boundOnActorUpdate = this.#onActorUpdate.bind(this);
		Hooks.on("updateActor", this.#boundOnActorUpdate);
	}

	/** @returns {import("@league/foundry").documents.Actor|null} */
	get actor() {
		return game.actors.get(this._actorId) ?? null;
	}

	static openForActor(actor) {
		const id = `sw5e-augmentations-${actor.id}`;
		const existing = foundry.applications.instances.get(id);
		if ( existing instanceof AugmentationsApp ) {
			existing.render(true);
			return existing;
		}
		const created = new AugmentationsApp({ actor });
		created.render(true);
		return created;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["sw5e-augmentations-manager"],
		window: {
			resizable: true,
			icon: "fas fa-microchip"
		},
		position: {
			width: 560,
			height: "auto"
		}
	};

	static PARTS = {
		manager: {
			template: getModulePath("templates/apps/augmentations-manager.hbs")
		}
	};

	get title() {
		const a = this.actor;
		const name = a?.name ?? localizeOrFallback("SW5E.Augmentations.FallbackActor", "Actor");
		return `${localizeOrFallback("SW5E.Augmentations.WindowTitle", "Cybernetic augmentations")}: ${name}`;
	}

	#boundOnActorUpdate;

	#onActorUpdate(doc, change) {
		if ( doc.id !== this._actorId ) return;
		if ( foundry.utils.hasProperty(change, "flags.sw5e.augmentations") ) this.render(false);
	}

	async _prepareContext() {
		const actor = this.actor;
		const actorPresent = Boolean(actor);
		const eligibleKind = Boolean(actor && isActorAugmentationCandidate(actor) && !isLegacyStarshipActor(actor));
		const validTarget = Boolean(actor && isActorValidAugmentationTarget(actor));
		const state = actor ? normalizeActorAugmentations(actor) : null;
		const derived = state?.derived?.sideEffects ?? {};
		const effective = state?.effective?.sideEffects ?? {};
		const ov = state?.overrides?.sideEffects ?? {};

		const sideEffectRows = AUGMENTATION_SIDE_EFFECT_KEYS.map(key => {
			const d = Boolean(derived[key]);
			const e = Boolean(effective[key]);
			const raw = ov[key];
			const mode = raw === true ? "on" : raw === false ? "off" : "inherit";
			return {
				key,
				label: sideEffectLabel(key),
				derivedText: formatYesNo(d),
				effectiveText: formatYesNo(e),
				overrideText: overrideModeText(mode),
				differs: d !== e
			};
		});

		const isGm = game.user.isGM;
		const canEdit = Boolean(actor?.isOwner || isGm);
		const showInstallWorkflow = eligibleKind && validTarget && canEdit;

		let installChoices = [];
		if ( showInstallWorkflow ) installChoices = await collectAugmentationInstallChoices();

		const occupied = state ? [...collectOccupiedBodySlots(state.installed)].sort() : [];
		const occupiedSlotsText = occupied.length
			? occupied.join(", ")
			: localizeOrFallback("SW5E.Augmentations.NoBodySlots", "—");

		const installedRows = (state?.installed ?? []).map(entry => ({
			uuid: entry.uuid ?? "",
			name: entry.name ?? entry.snapshot?.name ?? "—",
			category: entry.category ?? "—",
			rarity: entry.rarity ?? "—",
			bodySlotsText: Array.isArray(entry.bodySlots) && entry.bodySlots.length ? entry.bodySlots.join(", ") : "—",
			slotlessText: entry.slotless ? formatYesNo(true) : formatYesNo(false),
			sourceType: entry.sourceType ?? "—",
			installedAtText: entry.installedAt
				? new Date(entry.installedAt).toLocaleString(game.i18n.lang)
				: "—"
		}));

		const overrideControls = AUGMENTATION_SIDE_EFFECT_KEYS.map(key => {
			const raw = ov[key];
			const selected = raw === true ? "on" : raw === false ? "off" : "inherit";
			return {
				key,
				label: sideEffectLabel(key),
				options: [
					{ value: "inherit", label: localizeOrFallback("SW5E.Augmentations.OverrideInherit", "Use derived"), selected: selected === "inherit" },
					{ value: "on", label: localizeOrFallback("SW5E.Augmentations.OverrideOn", "Force on"), selected: selected === "on" },
					{ value: "off", label: localizeOrFallback("SW5E.Augmentations.OverrideOff", "Force off"), selected: selected === "off" }
				]
			};
		});

		return {
			actorPresent,
			eligibleKind,
			validTarget,
			currentCount: state ? getInstalledAugmentationCount(actor, state) : 0,
			maxCount: actor && state ? getMaxAugmentationsForActor(actor, state) : 0,
			occupiedSlotsText,
			sideEffectRows,
			installedRows,
			installChoices,
			canEdit,
			isGm,
			showGmOverrides: isGm && actorPresent,
			showInstallWorkflow,
			readOnlyHint: ""
		};
	}

	async close(options = {}) {
		Hooks.off("updateActor", this.#boundOnActorUpdate);
		return super.close(options);
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		if ( !root ) return;

		const validationEl = root.querySelector("[data-sw5e-aug-validation]");
		const setValidation = (validation) => {
			if ( !validationEl ) return;
			if ( !validation ) {
				validationEl.innerHTML = "";
				validationEl.hidden = true;
				return;
			}
			validationEl.innerHTML = formatValidationHtml(validation);
			validationEl.hidden = false;
		};

		root.querySelector(".sw5e-aug-install-submit")?.addEventListener("click", async () => {
			const actor = this.actor;
			if ( !actor ) return;
			const sel = root.querySelector("select[name=\"sw5e-aug-install-uuid\"]");
			const uuid = sel?.value?.trim();
			if ( !uuid ) {
				ui.notifications.warn(game.i18n.localize("SW5E.Augmentations.PickItemFirst"));
				return;
			}
			const item = await fromUuid(uuid);
			if ( !item ) {
				ui.notifications.error(game.i18n.localize("SW5E.Augmentations.ItemNotFound"));
				return;
			}
			const force = game.user.isGM && root.querySelector("input[name=\"sw5e-aug-force-install\"]")?.checked === true;
			const validation = validateAugmentationInstall(actor, item, { force });
			setValidation(validation);
			if ( !validation.ok ) {
				ui.notifications.warn(game.i18n.localize("SW5E.Augmentations.InstallBlocked"));
				return;
			}
			const result = await addAugmentationToActor(actor, item, { force: force === true });
			if ( result.ok ) {
				ui.notifications.info(game.i18n.localize("SW5E.Augmentations.InstallDone"));
				setValidation(null);
				await this.render(false);
			} else {
				setValidation(result.validation);
				ui.notifications.warn(game.i18n.localize("SW5E.Augmentations.InstallFailed"));
			}
		});

		for ( const btn of root.querySelectorAll("[data-sw5e-aug-remove]") ) {
			btn.addEventListener("click", async () => {
				const actor = this.actor;
				if ( !actor ) return;
				const uuid = btn.getAttribute("data-sw5e-aug-remove") ?? "";
				const itemName = btn.getAttribute("data-sw5e-aug-remove-name") ?? uuid;
				const validation = validateAugmentationRemove(actor, uuid);
				if ( !validation.ok ) {
					setValidation(validation);
					ui.notifications.warn(game.i18n.localize("SW5E.Augmentations.RemoveBlocked"));
					return;
				}
				const confirm = await DialogV2.wait({
					window: { title: game.i18n.localize("SW5E.Augmentations.RemoveConfirmTitle") },
					content: `<p>${game.i18n.format("SW5E.Augmentations.RemoveConfirmText", { name: foundry.utils.escapeHTML(itemName) })}</p>`,
					buttons: [
						{ action: "remove", label: game.i18n.localize("SW5E.Augmentations.Remove"), icon: "fas fa-trash", default: true },
						{ action: "cancel", label: game.i18n.localize("SW5E.Chassis.Cancel"), icon: "fas fa-times" }
					]
				});
				if ( confirm !== "remove" ) return;
				const result = await removeAugmentationFromActor(actor, uuid);
				if ( result.ok ) {
					ui.notifications.info(game.i18n.localize("SW5E.Augmentations.RemoveDone"));
					setValidation(null);
					await this.render(false);
				} else {
					setValidation(result.validation);
				}
			});
		}

		for ( const sel of root.querySelectorAll("select[data-sw5e-aug-override-key]") ) {
			sel.addEventListener("change", async () => {
				const actor = this.actor;
				if ( !actor || !game.user.isGM ) return;
				const key = sel.getAttribute("data-sw5e-aug-override-key");
				if ( !AUGMENTATION_SIDE_EFFECT_KEYS.includes(key) ) return;
				const v = sel.value;
				const value = v === "on" ? true : v === "off" ? false : null;
				await setAugmentationSideEffectOverride(actor, key, value);
				ui.notifications.info(game.i18n.localize("SW5E.Augmentations.OverrideSaved"));
				await this.render(false);
			});
		}
	}
}
