import { getModulePath } from "./module-support.mjs";
import {
	addDroidCustomizationToActor,
	DROID_DEFAULT_MOTOR_SLOTS,
	getEffectiveDroidCustomizationItemMeta,
	getMotorUpgradeCost,
	getMotorUpgradeTimeHours,
	isActorDroidCustomizationsManagerAllowed,
	isValidDroidCustomizationItemMeta,
	normalizeActorDroidCustomizations,
	removeDroidCustomizationFromActor,
	upgradeDroidMotorSlots,
	validateDroidCustomizationInstall,
	validateDroidCustomizationRemove,
	validateDroidMotorUpgrade
} from "./droid-customizations.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DialogV2 = foundry.applications.api.DialogV2;

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function formatDroidPickerLabel(name, meta) {
	const n = typeof name === "string" ? name.trim() : "";
	const base = n || "—";
	if ( !meta || typeof meta !== "object" ) return base;
	const catRaw = meta.category;
	const catLabel = catRaw === "protocol"
		? localizeOrFallback("SW5E.DroidCustomizations.PickerCategoryProtocol", "Protocol")
		: catRaw === "part"
			? localizeOrFallback("SW5E.DroidCustomizations.PickerCategoryPart", "Part")
			: "";
	let rarLabel = "";
	const rar = meta.rarity;
	if ( typeof rar === "string" && rar ) rarLabel = rar.charAt(0).toUpperCase() + rar.slice(1);
	if ( catLabel && rarLabel ) return `${base} — ${catLabel} · ${rarLabel}`;
	if ( catLabel ) return `${base} — ${catLabel}`;
	return base;
}

async function collectDroidCustomizationInstallChoices() {
	const choices = [];
	const seen = new Set();
	const push = (uuid, name, meta) => {
		if ( !uuid || seen.has(uuid) ) return;
		seen.add(uuid);
		choices.push({ uuid, name, pickerLabel: formatDroidPickerLabel(name, meta) });
	};

	for ( const item of game.items ) {
		const meta = getEffectiveDroidCustomizationItemMeta(item);
		if ( !meta || !isValidDroidCustomizationItemMeta(meta) ) continue;
		push(item.uuid, item.name, meta);
	}

	for ( const pack of game.packs ) {
		if ( pack.documentName !== "Item" ) continue;
		try {
			await pack.getIndex({
				fields: [
					"flags.sw5e.droidCustomization",
					"flags.sw5e-importer",
					"name",
					"type",
					"system.source",
					"system.description",
					"system.rarity"
				]
			});
			for ( const row of pack.index.values() ) {
				const stub = {
					flags: row.flags,
					system: row.system !== null && typeof row.system === "object" ? row.system : {},
					type: row.type,
					name: row.name
				};
				const meta = getEffectiveDroidCustomizationItemMeta(stub);
				if ( !meta || !isValidDroidCustomizationItemMeta(meta) ) continue;
				const uuid = pack.getUuid(row._id);
				push(uuid, row.name, meta);
			}
		} catch {
			/* pack unavailable */
		}
	}

	choices.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
	return choices;
}

function formatDroidValidationHtml(validation) {
	if ( !validation ) return "";
	const lines = [];
	if ( validation.blocking?.length ) {
		lines.push(`<p class="sw5e-aug-val-title sw5e-aug-val-blocking">${game.i18n.localize("SW5E.DroidCustomizations.ValidationBlocking")}</p><ul>`);
		for ( const b of validation.blocking ) {
			lines.push(`<li>${foundry.utils.escapeHTML(b.message)}</li>`);
		}
		lines.push("</ul>");
	}
	if ( validation.warnings?.length ) {
		lines.push(`<p class="sw5e-aug-val-title sw5e-aug-val-warn">${game.i18n.localize("SW5E.DroidCustomizations.ValidationWarnings")}</p><ul>`);
		for ( const w of validation.warnings ) {
			lines.push(`<li>${foundry.utils.escapeHTML(w.message)}</li>`);
		}
		lines.push("</ul>");
	}
	const info = validation.info;
	if ( info && typeof info === "object" ) {
		lines.push(`<p class="sw5e-aug-val-title">${game.i18n.localize("SW5E.DroidCustomizations.ValidationInfo")}</p><dl class="sw5e-aug-info-dl">`);
		const add = (dtKey, val) => {
			if ( val == null || val === "" ) return;
			lines.push(`<dt>${game.i18n.localize(dtKey)}</dt><dd>${foundry.utils.escapeHTML(String(val))}</dd>`);
		};
		add("SW5E.DroidCustomizations.InfoMotorTotal", info.motorSlots);
		add("SW5E.DroidCustomizations.InfoMotorUsed", info.usedMotorSlots);
		add("SW5E.DroidCustomizations.InfoMotorAvailable", info.availableMotorSlots);
		add("SW5E.DroidCustomizations.InfoPartsCount", info.partsCount);
		add("SW5E.DroidCustomizations.InfoProtocolsCount", info.protocolsCount);
		add("SW5E.DroidCustomizations.InfoPartsAllowed", info.partsAllowed);
		add("SW5E.DroidCustomizations.InfoProtocolsAllowed", info.protocolsAllowed);
		add("SW5E.DroidCustomizations.InfoMotorCost", info.motorSlotCost);
		if ( info.requiredTool ) add("SW5E.DroidCustomizations.InfoTool", info.requiredTool);
		if ( info.installDC != null ) add("SW5E.DroidCustomizations.InfoDC", info.installDC);
		if ( info.currentMotorSlots != null ) add("SW5E.DroidCustomizations.InfoCurrentMotor", info.currentMotorSlots);
		if ( info.targetMotorSlots != null ) add("SW5E.DroidCustomizations.InfoTargetMotor", info.targetMotorSlots);
		if ( info.upgradeCost != null ) add("SW5E.DroidCustomizations.InfoUpgradeCost", info.upgradeCost);
		if ( info.upgradeTimeHours != null ) add("SW5E.DroidCustomizations.InfoUpgradeHours", info.upgradeTimeHours);
		lines.push("</dl>");
	}
	return lines.join("\n");
}

/**
 * @param {import("@league/foundry").documents.Actor|null} actor
 * @param {string} uuid
 */
async function openInstalledDroidSource(actor, uuid) {
	const id = String(uuid ?? "").trim();
	if ( !id ) {
		ui.notifications.warn(localizeOrFallback("SW5E.DroidCustomizations.OpenItemMissingUuid", "This entry has no linked item UUID."));
		return;
	}
	try {
		const doc = await fromUuid(id);
		if ( doc?.documentName === "Item" && typeof doc.sheet?.render === "function" ) {
			const rendered = doc.sheet.render(true);
			if ( rendered instanceof Promise ) await rendered;
			return;
		}
	} catch ( err ) {
		console.warn("SW5E | Droid customizations: open source item failed", err);
	}
	ui.notifications.warn(localizeOrFallback("SW5E.DroidCustomizations.OpenItemNotFound", "Could not open that item."));
}

function explainPartsLimit(state) {
	const lim = state.limits;
	const pol = state.derived.capacity.partsPolicy;
	const ab = lim.partsAbility;
	if ( pol === "explicit" && typeof ab === "string" && ab ) {
		return game.i18n.format("SW5E.DroidCustomizations.PolicyPartsExplicit", { ability: ab.toUpperCase() });
	}
	return game.i18n.localize("SW5E.DroidCustomizations.PolicyPartsFallback");
}

function explainProtocolsLimit(state) {
	const lim = state.limits;
	const pol = state.derived.capacity.protocolsPolicy;
	const ab = lim.protocolsAbility;
	if ( pol === "explicit" && typeof ab === "string" && ab ) {
		return game.i18n.format("SW5E.DroidCustomizations.PolicyProtocolsExplicit", { ability: ab.toUpperCase() });
	}
	return game.i18n.localize("SW5E.DroidCustomizations.PolicyProtocolsFallback");
}

export class DroidCustomizationsApp extends HandlebarsApplicationMixin(ApplicationV2) {
	/** @param {{ actor: import("@league/foundry").documents.Actor }} opts */
	constructor({ actor } = {}) {
		if ( !actor?.id ) throw new Error("DroidCustomizationsApp requires a persisted actor with an id.");
		super({ id: `sw5e-droid-customizations-${actor.id}` });
		this._actorId = actor.id;
		this.#boundOnActorUpdate = this.#onActorUpdate.bind(this);
		Hooks.on("updateActor", this.#boundOnActorUpdate);
	}

	/** @returns {import("@league/foundry").documents.Actor|null} */
	get actor() {
		return game.actors.get(this._actorId) ?? null;
	}

	static openForActor(actor) {
		if ( !actor?.id ) throw new Error("DroidCustomizationsApp requires a persisted actor with an id.");
		if ( !isActorDroidCustomizationsManagerAllowed(actor) ) {
			ui.notifications.warn(localizeOrFallback("SW5E.DroidCustomizations.OpenBlocked", "This actor cannot use Droid Customizations."));
			return null;
		}
		const id = `sw5e-droid-customizations-${actor.id}`;
		const existing = foundry.applications.instances.get(id);
		if ( existing instanceof DroidCustomizationsApp ) {
			existing.render(true);
			return existing;
		}
		const created = new DroidCustomizationsApp({ actor });
		created.render(true);
		return created;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["sw5e-droid-customizations-manager"],
		window: {
			resizable: true,
			icon: "fas fa-robot"
		},
		position: {
			width: 580,
			height: 560
		}
	};

	static PARTS = {
		manager: {
			template: getModulePath("templates/apps/droid-customizations-manager.hbs")
		}
	};

	get title() {
		const a = this.actor;
		const name = a?.name ?? localizeOrFallback("SW5E.DroidCustomizations.FallbackActor", "Actor");
		return `${localizeOrFallback("SW5E.DroidCustomizations.WindowTitle", "Droid customizations")}: ${name}`;
	}

	#boundOnActorUpdate;

	#onActorUpdate(doc, change) {
		if ( doc.id !== this._actorId ) return;
		if ( foundry.utils.hasProperty(change, "flags.sw5e.droidCustomizations") ) this.render(false);
	}

	async _prepareContext() {
		const actor = this.actor;
		const actorPresent = Boolean(actor);
		const eligible = Boolean(actor && isActorDroidCustomizationsManagerAllowed(actor));
		const state = actor ? normalizeActorDroidCustomizations(actor) : null;
		const cap = state?.derived?.capacity;
		const counts = state?.derived?.counts;

		const isGm = game.user.isGM;
		const canEdit = Boolean(actor?.isOwner || isGm);
		const showWorkflow = eligible && canEdit;

		let installChoices = [];
		if ( showWorkflow ) installChoices = await collectDroidCustomizationInstallChoices();

		const installedList = state?.installed ?? [];
		const installedRows = installedList.map(entry => {
			const uuid = entry.uuid ?? "";
			const cat = entry.category ?? "";
			const catLabel = cat === "protocol"
				? game.i18n.localize("SW5E.DroidCustomizations.CategoryProtocol")
				: cat === "part"
					? game.i18n.localize("SW5E.DroidCustomizations.CategoryPart")
					: cat || "—";
			const rar = entry.rarity ?? "—";
			const rarLabel = typeof rar === "string" && rar ? rar.charAt(0).toUpperCase() + rar.slice(1) : String(rar);
			return {
				uuid,
				name: entry.name ?? entry.snapshot?.name ?? "—",
				categoryLabel: catLabel,
				rarity: rarLabel,
				motorSlotCost: Math.max(1, Math.floor(Number(entry.motorSlotCost) || 1)),
				installedAtText: entry.installedAt
					? new Date(entry.installedAt).toLocaleDateString(game.i18n.lang)
					: "—",
				sourceType: entry.sourceType ?? ""
			};
		});

		const currentMotor = state?.motorSlots ?? DROID_DEFAULT_MOTOR_SLOTS;
		let pickNext = true;
		const motorUpgradeTargets = [3, 4, 5, 6].map(t => {
			const v = actor ? validateDroidMotorUpgrade(actor, t) : null;
			const cost = getMotorUpgradeCost(actor, t);
			const hours = getMotorUpgradeTimeHours(actor, t);
			const disabled = !actor || t <= currentMotor || (v && !v.ok && !isGm);
			const selected = !disabled && pickNext;
			if ( selected ) pickNext = false;
			return {
				value: t,
				selected,
				disabled,
				cost,
				costText: cost != null ? String(cost) : "—",
				hoursText: String(hours),
				blockedSummary: v && !v.ok && v.blocking?.length ? v.blocking.map(b => b.message).join("; ") : ""
			};
		});

		const partsExplain = state ? explainPartsLimit(state) : "";
		const protocolsExplain = state ? explainProtocolsLimit(state) : "";

		return {
			actorPresent,
			eligible,
			motorSlots: state?.motorSlots ?? 0,
			motorUsed: cap?.motorUsed ?? 0,
			motorAvailable: cap?.motorAvailable ?? 0,
			installedTotal: counts?.total ?? 0,
			partsCount: counts?.parts ?? 0,
			protocolsCount: counts?.protocols ?? 0,
			partsAllowed: cap?.partsAllowed ?? 0,
			protocolsAllowed: cap?.protocolsAllowed ?? 0,
			partsExplain,
			protocolsExplain,
			limitsPartsAbility: state?.limits?.partsAbility ?? "",
			limitsProtocolsAbility: state?.limits?.protocolsAbility ?? "",
			installedRows,
			installChoices,
			canEdit,
			isGm,
			showWorkflow,
			motorUpgradeTargets,
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

		const installValidationEl = root.querySelector("[data-sw5e-droid-validation-install]");
		const motorValidationEl = root.querySelector("[data-sw5e-droid-validation-motor]");
		const setInstallValidation = (validation) => {
			if ( !installValidationEl ) return;
			if ( !validation ) {
				installValidationEl.innerHTML = "";
				installValidationEl.hidden = true;
				return;
			}
			installValidationEl.innerHTML = formatDroidValidationHtml(validation);
			installValidationEl.hidden = false;
		};
		const setMotorValidation = (validation) => {
			if ( !motorValidationEl ) return;
			if ( !validation ) {
				motorValidationEl.innerHTML = "";
				motorValidationEl.hidden = true;
				return;
			}
			motorValidationEl.innerHTML = formatDroidValidationHtml(validation);
			motorValidationEl.hidden = false;
		};

		const motorSelect = root.querySelector("select[name=\"sw5e-droid-motor-target\"]");
		const refreshMotorPreview = () => {
			const actor = this.actor;
			if ( !actor || !motorSelect ) return;
			const t = Math.floor(Number(motorSelect.value) || 0);
			const costEl = root.querySelector("[data-sw5e-droid-motor-cost]");
			const hoursEl = root.querySelector("[data-sw5e-droid-motor-hours]");
			if ( !t ) {
				if ( costEl ) costEl.textContent = "—";
				if ( hoursEl ) hoursEl.textContent = "—";
				setMotorValidation(null);
				return;
			}
			const cost = getMotorUpgradeCost(actor, t);
			const hours = getMotorUpgradeTimeHours(actor, t);
			if ( costEl ) costEl.textContent = cost != null ? String(cost) : "—";
			if ( hoursEl ) hoursEl.textContent = String(hours);
			const v = validateDroidMotorUpgrade(actor, t);
			setMotorValidation(v.ok ? null : v);
		};
		motorSelect?.addEventListener("change", refreshMotorPreview);
		refreshMotorPreview();

		root.querySelector(".sw5e-droid-install-submit")?.addEventListener("click", async () => {
			const actor = this.actor;
			if ( !actor ) return;
			const sel = root.querySelector("select[name=\"sw5e-droid-install-uuid\"]");
			const uuid = sel?.value?.trim();
			if ( !uuid ) {
				ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.PickItemFirst"));
				return;
			}
			const item = await fromUuid(uuid);
			if ( !item ) {
				ui.notifications.error(game.i18n.localize("SW5E.DroidCustomizations.ItemNotFound"));
				return;
			}
			const force = game.user.isGM && root.querySelector("input[name=\"sw5e-droid-force-install\"]")?.checked === true;
			const validation = validateDroidCustomizationInstall(actor, item, { force });
			setInstallValidation(validation);
			if ( !validation.ok ) {
				ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.InstallBlocked"));
				return;
			}
			const result = await addDroidCustomizationToActor(actor, item, { force: force === true });
			if ( result.ok ) {
				ui.notifications.info(game.i18n.localize("SW5E.DroidCustomizations.InstallDone"));
				setInstallValidation(null);
				await this.render(false);
			}
			else {
				setInstallValidation(result.validation);
				ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.InstallFailed"));
			}
		});

		for ( const btn of root.querySelectorAll("[data-sw5e-droid-remove]") ) {
			btn.addEventListener("click", async () => {
				const actor = this.actor;
				if ( !actor ) return;
				const uuid = btn.getAttribute("data-sw5e-droid-remove") ?? "";
				const itemName = btn.getAttribute("data-sw5e-droid-remove-name") ?? uuid;
				const validation = validateDroidCustomizationRemove(actor, uuid);
				if ( !validation.ok ) {
					setInstallValidation(validation);
					ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.RemoveBlocked"));
					return;
				}
				const confirm = await DialogV2.wait({
					window: { title: game.i18n.localize("SW5E.DroidCustomizations.RemoveConfirmTitle") },
					content: `<p>${game.i18n.format("SW5E.DroidCustomizations.RemoveConfirmText", { name: foundry.utils.escapeHTML(itemName) })}</p>`,
					buttons: [
						{ action: "remove", label: game.i18n.localize("SW5E.DroidCustomizations.Remove"), icon: "fas fa-trash", default: true },
						{ action: "cancel", label: game.i18n.localize("SW5E.Chassis.Cancel"), icon: "fas fa-times" }
					]
				});
				if ( confirm !== "remove" ) return;
				const result = await removeDroidCustomizationFromActor(actor, uuid);
				if ( result.ok ) {
					ui.notifications.info(game.i18n.localize("SW5E.DroidCustomizations.RemoveDone"));
					setInstallValidation(null);
					await this.render(false);
				}
				else {
					setInstallValidation(result.validation);
				}
			});
		}

		for ( const btn of root.querySelectorAll("[data-sw5e-droid-open-item]") ) {
			btn.addEventListener("click", async (ev) => {
				ev.preventDefault();
				await openInstalledDroidSource(this.actor, btn.getAttribute("data-sw5e-droid-open-item") ?? "");
			});
		}

		root.querySelector(".sw5e-droid-motor-upgrade-submit")?.addEventListener("click", async () => {
			const actor = this.actor;
			if ( !actor ) return;
			const sel = root.querySelector("select[name=\"sw5e-droid-motor-target\"]");
			const target = Math.floor(Number(sel?.value) || 0);
			if ( !target ) {
				ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.MotorPickTarget"));
				return;
			}
			const force = game.user.isGM && root.querySelector("input[name=\"sw5e-droid-force-motor\"]")?.checked === true;
			const validation = validateDroidMotorUpgrade(actor, target, { force });
			setMotorValidation(validation);
			if ( !validation.ok ) {
				ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.MotorUpgradeBlocked"));
				return;
			}
			const result = await upgradeDroidMotorSlots(actor, target, { force: force === true });
			if ( result.ok ) {
				ui.notifications.info(game.i18n.localize("SW5E.DroidCustomizations.MotorUpgradeDone"));
				setMotorValidation(null);
				await this.render(false);
			}
			else {
				setMotorValidation(result.validation);
			}
		});
	}
}
