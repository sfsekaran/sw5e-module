import { getModuleSettingValue } from "./module-support.mjs";

export const CURRENCY_ENABLED_MAP_SETTING = "currencyEnabledMap";
export const CURRENCY_CUSTOM_RATES_SETTING = "currencyCustomRates";
export const CURRENCY_SETTINGS_MENU = "currencyConfiguration";

export const BASE_CURRENCY_KEY = "gc";

export const SW_CURRENCY_REGISTRY = Object.freeze({
	gc: Object.freeze({
		key: "gc",
		label: "SW5E.CurrencyGC",
		abbreviation: "SW5E.CurrencyAbbrGC",
		creditsPerUnit: 1,
		fixed: true,
		defaultEnabled: true
	}),
	wu: Object.freeze({
		key: "wu",
		label: "SW5E.CurrencyWupiupi",
		abbreviation: "SW5E.CurrencyAbbrWupiupi",
		creditsPerUnit: 0.625,
		fixed: true,
		defaultEnabled: false
	}),
	tr: Object.freeze({
		key: "tr",
		label: "SW5E.CurrencyTrugut",
		abbreviation: "SW5E.CurrencyAbbrTrugut",
		creditsPerUnit: 10,
		fixed: true,
		defaultEnabled: false
	}),
	pg: Object.freeze({
		key: "pg",
		label: "SW5E.CurrencyPeggat",
		abbreviation: "SW5E.CurrencyAbbrPeggat",
		creditsPerUnit: 40,
		fixed: true,
		defaultEnabled: false
	}),
	dr: Object.freeze({
		key: "dr",
		label: "SW5E.CurrencyDruggat",
		abbreviation: "SW5E.CurrencyAbbrDruggat",
		creditsPerUnit: null,
		fixed: false,
		defaultEnabled: false
	}),
	au: Object.freeze({
		key: "au",
		label: "SW5E.CurrencyAurodium",
		abbreviation: "SW5E.CurrencyAbbrAurodium",
		creditsPerUnit: null,
		fixed: false,
		defaultEnabled: false
	}),
	nv: Object.freeze({
		key: "nv",
		label: "SW5E.CurrencyNovaCrystal",
		abbreviation: "SW5E.CurrencyAbbrNovaCrystal",
		creditsPerUnit: null,
		fixed: false,
		defaultEnabled: false
	})
});

const CURRENCY_ALIASES = Object.freeze({
	credit: BASE_CURRENCY_KEY,
	credits: BASE_CURRENCY_KEY,
	gc: BASE_CURRENCY_KEY,
	gp: BASE_CURRENCY_KEY,
	ic: BASE_CURRENCY_KEY,
	imperialcredit: BASE_CURRENCY_KEY,
	imperialcredits: BASE_CURRENCY_KEY,
	"imperial-credit": BASE_CURRENCY_KEY
});

function cloneData(data) {
	if ( data === undefined ) return undefined;
	if ( typeof globalThis.structuredClone === "function" ) return globalThis.structuredClone(data);
	return JSON.parse(JSON.stringify(data));
}

function getGame() {
	return globalThis.game ?? null;
}

function localize(key, fallback=key) {
	return getGame()?.i18n?.localize?.(key) ?? fallback;
}

function formatI18n(key, data, fallback) {
	return getGame()?.i18n?.format?.(key, data) ?? fallback;
}

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function toFiniteNumber(value, fallback=null) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveNumber(value, fallback=null) {
	const numeric = toFiniteNumber(value, fallback);
	return (numeric != null) && (numeric > 0) ? numeric : fallback;
}

function getStoredSetting(key, fallback) {
	return getModuleSettingValue(key, fallback) ?? cloneData(fallback);
}

function applyTooltip(element, tooltip) {
	if ( !element || !tooltip ) return;
	element.setAttribute("title", tooltip);
	element.dataset.tooltip = tooltip;
}

function getLocalizedCurrencyLabel(key) {
	const entry = SW_CURRENCY_REGISTRY[key];
	return entry ? localize(entry.label, entry.key.toUpperCase()) : key;
}

export function getBaseCurrencyKey() {
	return BASE_CURRENCY_KEY;
}

export function getCurrencyRegistry() {
	return cloneData(SW_CURRENCY_REGISTRY);
}

export function getDefaultEnabledCurrencyMap() {
	return Object.fromEntries(Object.entries(SW_CURRENCY_REGISTRY).map(([key, entry]) => [key, Boolean(entry.defaultEnabled)]));
}

export function getDefaultCustomCurrencyRates() {
	return {};
}

export function getEnabledCurrencyMap() {
	const stored = getStoredSetting(CURRENCY_ENABLED_MAP_SETTING, {});
	const defaults = getDefaultEnabledCurrencyMap();
	if ( !stored || (typeof stored !== "object") || Array.isArray(stored) ) return defaults;
	const enabled = { ...defaults, ...stored };
	enabled[BASE_CURRENCY_KEY] = true;
	return enabled;
}

export function getCustomCurrencyRates() {
	const stored = getStoredSetting(CURRENCY_CUSTOM_RATES_SETTING, {});
	if ( !stored || (typeof stored !== "object") || Array.isArray(stored) ) return {};
	const rates = {};
	for ( const [key, value] of Object.entries(stored) ) {
		const numeric = toPositiveNumber(value, null);
		if ( numeric != null ) rates[key] = numeric;
	}
	return rates;
}

export function getCurrencyCreditsPerUnit(key, { customRates=getCustomCurrencyRates() }={}) {
	const entry = SW_CURRENCY_REGISTRY[key];
	if ( !entry ) return null;
	if ( entry.fixed ) return entry.creditsPerUnit;
	return toPositiveNumber(customRates[key], null);
}

export function getCurrencyConversion(key, options={}) {
	const creditsPerUnit = getCurrencyCreditsPerUnit(key, options);
	return creditsPerUnit ? (1 / creditsPerUnit) : null;
}

function formatCreditsPerUnit(value) {
	const formatted = getGame()?.dnd5e?.utils?.formatNumber?.(value, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 3
	});
	return formatted ?? String(value);
}

export function getCurrencyTooltipText(key, { customRates=getCustomCurrencyRates(), creditsPerUnit }={}) {
	const entry = SW_CURRENCY_REGISTRY[key];
	if ( !entry ) return "";
	const resolvedCreditsPerUnit = creditsPerUnit ?? getCurrencyCreditsPerUnit(key, { customRates });
	if ( resolvedCreditsPerUnit == null ) {
		const currencyLabel = localize(entry.label, entry.key.toUpperCase());
		return formatI18n(
			"SW5E.CurrencyTooltipNeedsConfig",
			{ currency: currencyLabel },
			`${currencyLabel} requires a configured exchange rate.`
		);
	}
	const tooltipKey = entry.fixed ? "SW5E.CurrencyTooltipFixed" : "SW5E.CurrencyTooltipConfigured";
	const currencyLabel = localize(entry.label, entry.key.toUpperCase());
	const creditsLabel = localize("SW5E.CurrencyGC", BASE_CURRENCY_KEY.toUpperCase());
	const rate = formatCreditsPerUnit(resolvedCreditsPerUnit);
	return formatI18n(
		tooltipKey,
		{ currency: currencyLabel, rate, credits: creditsLabel },
		`1 ${currencyLabel} = ${rate} ${creditsLabel}.`
	);
}

export function getConfiguredCurrencies({ enabledMap=getEnabledCurrencyMap(), customRates=getCustomCurrencyRates() }={}) {
	return Object.values(SW_CURRENCY_REGISTRY).map(entry => {
		const enabled = entry.key === BASE_CURRENCY_KEY ? true : Boolean(enabledMap[entry.key]);
		const creditsPerUnit = getCurrencyCreditsPerUnit(entry.key, { customRates });
		const usable = entry.fixed || (creditsPerUnit != null);
		return {
			...cloneData(entry),
			enabled,
			creditsPerUnit,
			usable,
			referenceOnly: enabled && !usable,
			tooltip: getCurrencyTooltipText(entry.key, { customRates, creditsPerUnit })
		};
	});
}

export function buildSw5eCurrencyConfig({ enabledMap=getEnabledCurrencyMap(), customRates=getCustomCurrencyRates() }={}) {
	const currencies = {};
	for ( const entry of getConfiguredCurrencies({ enabledMap, customRates }) ) {
		if ( !entry.enabled || !entry.usable ) continue;
		currencies[entry.key] = {
			label: entry.label,
			abbreviation: entry.abbreviation,
			conversion: getCurrencyConversion(entry.key, { customRates }),
			tooltip: entry.tooltip
		};
	}
	if ( !currencies[BASE_CURRENCY_KEY] ) {
		const baseEntry = SW_CURRENCY_REGISTRY[BASE_CURRENCY_KEY];
		currencies[BASE_CURRENCY_KEY] = {
			label: baseEntry.label,
			abbreviation: baseEntry.abbreviation,
			conversion: 1,
			tooltip: getCurrencyTooltipText(BASE_CURRENCY_KEY)
		};
	}
	return currencies;
}

export function applySw5eCurrencyConfig(config, strict=true) {
	if ( strict ) config.currencies = {};
	Object.assign(config.currencies, buildSw5eCurrencyConfig());
}

export function getActiveCurrencyKeys() {
	return Object.keys(buildSw5eCurrencyConfig());
}

export function normalizeSwCurrencyKey(key) {
	if ( typeof key !== "string" ) return key;
	const normalized = key.trim().toLowerCase();
	return CURRENCY_ALIASES[normalized] ?? normalized;
}

export function normalizeSwPriceDenomination(denomination, { fallbackToBase=true }={}) {
	const normalized = normalizeSwCurrencyKey(denomination);
	if ( SW_CURRENCY_REGISTRY[normalized] ) {
		if ( !fallbackToBase ) return normalized;
		return getActiveCurrencyKeys().includes(normalized) ? normalized : BASE_CURRENCY_KEY;
	}
	return fallbackToBase ? BASE_CURRENCY_KEY : normalized;
}

export function normalizeSwCurrencyWallet(wallet={}, { includeActive=true }={}) {
	const normalizedWallet = {};
	for ( const [key, value] of Object.entries(wallet ?? {}) ) {
		const normalizedKey = normalizeSwPriceDenomination(key, { fallbackToBase: false });
		if ( !SW_CURRENCY_REGISTRY[normalizedKey] ) continue;
		const numeric = toFiniteNumber(value, 0) ?? 0;
		normalizedWallet[normalizedKey] = (normalizedWallet[normalizedKey] ?? 0) + numeric;
	}

	if ( includeActive ) {
		for ( const key of getActiveCurrencyKeys() ) normalizedWallet[key] ??= 0;
	}

	normalizedWallet[BASE_CURRENCY_KEY] ??= 0;
	return normalizedWallet;
}

function currencyWalletsMatch(left={}, right={}) {
	const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
	for ( const key of keys ) {
		const leftValue = toFiniteNumber(left?.[key], 0) ?? 0;
		const rightValue = toFiniteNumber(right?.[key], 0) ?? 0;
		if ( leftValue !== rightValue ) return false;
	}
	return true;
}

export async function syncWorldActorCurrencyWallets(actors=Array.from(getGame()?.actors ?? [])) {
	if ( !getGame()?.user?.isGM ) return 0;

	const updates = [];
	for ( const actor of actors ) {
		if ( !actor?.id ) continue;
		const currentWallet = actor.system?.currency ?? {};
		const normalizedWallet = normalizeSwCurrencyWallet(currentWallet);
		if ( currencyWalletsMatch(currentWallet, normalizedWallet) ) continue;
		updates.push({
			_id: actor.id,
			"system.currency": normalizedWallet
		});
	}

	if ( !updates.length ) return 0;
	await Actor.updateDocuments(updates);
	return updates.length;
}

function initializeActorCurrencyWallet(document, data={}) {
	const currentWallet = data.system?.currency
		?? document?._source?.system?.currency
		?? document?.system?.currency
		?? {};
	const normalizedWallet = normalizeSwCurrencyWallet(currentWallet);
	if ( currencyWalletsMatch(currentWallet, normalizedWallet) ) return;
	document.updateSource({ "system.currency": normalizedWallet });
}

function createCurrencyLabelNode(key) {
	const label = document.createElement("label");
	label.className = `denomination ${key}`;
	label.textContent = getLocalizedCurrencyLabel(key);
	return label;
}

function createCurrencyInputNode(key, value) {
	const input = document.createElement("input");
	input.type = "text";
	input.name = `system.currency.${key}`;
	input.value = String(value ?? 0);
	input.dataset.dtype = "Number";
	return input;
}

function injectMissingWalletFields(root, actor) {
	if ( !root || !actor ) return;

	const walletContainer = root.querySelector("label.currency, ol.currency.flexrow");
	if ( !walletContainer ) return;

	const normalizedWallet = normalizeSwCurrencyWallet(actor.system?.currency ?? {});
	const existingKeys = new Set(Array.from(walletContainer.querySelectorAll('input[name^="system.currency."]'))
		.map(input => input.name.replace("system.currency.", "")));

	for ( const [key, value] of Object.entries(normalizedWallet) ) {
		if ( existingKeys.has(key) ) {
			const input = walletContainer.querySelector(`[name="system.currency.${key}"]`);
			if ( input ) input.value = String(value ?? 0);
			continue;
		}

		walletContainer.appendChild(createCurrencyLabelNode(key));
		walletContainer.appendChild(createCurrencyInputNode(key, value));
	}
}

export function rerenderOpenWindows() {
	for ( const app of Object.values(ui.windows ?? {}) ) app?.render?.(true);
}

function annotateWalletFields(root) {
	for ( const [key, config] of Object.entries(CONFIG.DND5E.currencies ?? {}) ) {
		const tooltip = getCurrencyTooltipText(key) || config?.tooltip || "";
		if ( !tooltip ) continue;

		for ( const input of root.querySelectorAll(`[name="system.currency.${key}"]`) ) {
			applyTooltip(input, tooltip);
			const label = input.closest(".form-group, .currency, .wallet, li, tr, .grid, .item")
				?.querySelector("label, .label, .currency-label, .denomination");
			applyTooltip(label, tooltip);
		}
	}
}

function annotatePriceDenominations(root) {
	for ( const select of root.querySelectorAll('select[name$=".price.denomination"]') ) {
		const refreshTitle = () => {
			const selected = select.selectedOptions?.[0] ?? null;
			applyTooltip(select, selected?.title ?? "");
		};

		for ( const option of Array.from(select.options) ) {
			const currency = CONFIG.DND5E.currencies?.[option.value];
			const tooltip = getCurrencyTooltipText(option.value) || currency?.tooltip || "";
			if ( tooltip ) option.title = tooltip;
		}

		if ( select.dataset.sw5eCurrencyBound !== "true" ) {
			select.dataset.sw5eCurrencyBound = "true";
			select.addEventListener("change", refreshTitle);
		}

		refreshTitle();
	}
}

export function applyCurrencyTooltips(html) {
	const root = getHtmlRoot(html);
	if ( !root ) return;
	annotateWalletFields(root);
	annotatePriceDenominations(root);
}

export function registerCurrencyTooltipHooks() {
	Hooks.on("renderActorSheetV2", (app, html) => applyCurrencyTooltips(html));
	Hooks.on("renderItemSheetV2", (app, html) => applyCurrencyTooltips(html));
}

export function registerCurrencyActorHooks() {
	Hooks.on("preCreateActor", (document, data) => initializeActorCurrencyWallet(document, data));
	Hooks.on("renderBaseActorSheet", (app, html, context) => {
		const root = getHtmlRoot(html);
		if ( !root || !context?.actor ) return;
		injectMissingWalletFields(root, context.actor);
		applyCurrencyTooltips(root);
	});
}

export function getCurrencySettingsRows() {
	const enabledMap = getEnabledCurrencyMap();
	const customRates = getCustomCurrencyRates();
	return getConfiguredCurrencies({ enabledMap, customRates }).map(entry => ({
		...entry,
		labelText: localize(entry.label, entry.key.toUpperCase()),
		abbreviationText: localize(entry.abbreviation, entry.key.toUpperCase()),
		fixedRateText: entry.creditsPerUnit != null ? formatCreditsPerUnit(entry.creditsPerUnit) : "",
		customRateValue: customRates[entry.key] ?? "",
		isBaseCurrency: entry.key === BASE_CURRENCY_KEY
	}));
}
