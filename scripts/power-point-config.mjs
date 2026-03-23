import { getModulePath } from "./module-support.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function getNumericValue(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function parseNumberInput(value, fallback=0) {
	const text = String(value ?? "").trim();
	if ( !text ) return fallback;
	return getNumericValue(text) ?? fallback;
}

function parseNullableNumberInput(value) {
	const text = String(value ?? "").trim();
	if ( !text ) return null;
	return getNumericValue(text);
}

function formatPointsLabel(castType) {
	return game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Point.Label`);
}

export class PowerPointConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor, castType }={}) {
		super();
		this.actor = actor;
		this.castType = castType;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["config-sheet", "power-point-config"],
		window: {
			resizable: true
		},
		position: {
			width: 420,
			height: "auto"
		}
	};

	static PARTS = {
		config: {
			template: getModulePath("templates/apps/power-point-config.hbs")
		}
	};

	get title() {
		return `${formatPointsLabel(this.castType)} Configuration`;
	}

	async _prepareContext(options={}) {
		const source = foundry.utils.deepClone(this.actor?._source?.system?.powercasting?.[this.castType]?.points ?? {});
		const points = this.actor?.system?.powercasting?.[this.castType]?.points ?? {};
		const sourceBonuses = source.bonuses ??= {};
		source.value = parseNumberInput(source.value, getNumericValue(points.value) ?? 0);
		source.temp = parseNumberInput(source.temp, getNumericValue(points.temp) ?? 0);
		source.tempmax = parseNumberInput(source.tempmax, getNumericValue(points.tempmax) ?? 0);
		sourceBonuses.level ??= "";
		sourceBonuses.overall ??= "";

		const max = getNumericValue(points.max) ?? 0;
		const tempmax = getNumericValue(points.tempmax) ?? 0;
		return {
			castType: this.castType,
			source,
			value: getNumericValue(points.value) ?? source.value ?? 0,
			effectiveMax: Math.max(0, max + tempmax),
			calculatedMax: max,
			hasMaxOverride: source.max !== null && source.max !== undefined && source.max !== "",
			maximumLegend: `Maximum ${formatPointsLabel(this.castType)}`,
			currentLegend: `Current ${formatPointsLabel(this.castType)}`,
			currentLabel: "Current Points",
			tempLabel: game.i18n.localize("DND5E.TMP"),
			tempMaxLabel: "Temporary Maximum",
			maxOverrideLabel: "Maximum Override",
			maxOverrideHint: `Leave blank to use the calculated ${formatPointsLabel(this.castType).toLowerCase()} maximum.`,
			perLevelBonusLabel: "Per Level Bonus",
			overallBonusLabel: "Overall Bonus",
			saveLabel: "Save"
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		const form = root?.querySelector("form.sw5e-power-point-config-form");
		if ( !form || form.dataset.sw5eBound === "true" ) return;
		form.dataset.sw5eBound = "true";
		form.addEventListener("submit", this.#onSubmit.bind(this));
	}

	async #onSubmit(event) {
		event.preventDefault();
		if ( !this.actor ) return;

		const formData = new FormData(event.currentTarget);
		const basePath = `system.powercasting.${this.castType}.points`;
		const updateData = {
			[`${basePath}.value`]: parseNumberInput(formData.get(`${basePath}.value`)),
			[`${basePath}.temp`]: parseNumberInput(formData.get(`${basePath}.temp`)),
			[`${basePath}.tempmax`]: parseNumberInput(formData.get(`${basePath}.tempmax`)),
			[`${basePath}.max`]: parseNullableNumberInput(formData.get(`${basePath}.max`)),
			[`${basePath}.bonuses.level`]: String(formData.get(`${basePath}.bonuses.level`) ?? "").trim(),
			[`${basePath}.bonuses.overall`]: String(formData.get(`${basePath}.bonuses.overall`) ?? "").trim()
		};

		const currentMax = getNumericValue(this.actor.system?.powercasting?.[this.castType]?.points?.max) ?? 0;
		const expanded = foundry.utils.expandObject(updateData);
		const clone = this.actor.clone(foundry.utils.deepClone(expanded));
		const clonedPoints = clone.system?.powercasting?.[this.castType]?.points ?? {};
		const nextMax = getNumericValue(clonedPoints.max) ?? 0;
		const nextTempMax = getNumericValue(clonedPoints.tempmax) ?? 0;
		const submittedCurrent = getNumericValue(updateData[`${basePath}.value`]) ?? 0;
		const currentWithDelta = submittedCurrent + (nextMax - currentMax);
		updateData[`${basePath}.value`] = Math.max(0, Math.min(currentWithDelta, Math.max(0, nextMax + nextTempMax)));

		await this.actor.update(updateData);
		this.render(true);
	}
}

export function openPowerPointConfig(actor, castType) {
	if ( !actor || !["force", "tech"].includes(castType) ) return;
	new PowerPointConfigApp({ actor, castType }).render(true);
}
