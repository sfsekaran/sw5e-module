import { addHooks } from "./patch/addHooks.mjs";
import { registerCurrencyActorHooks, registerCurrencyTooltipHooks, syncWorldActorCurrencyWallets } from "./currencies.mjs";
import { patchConfig } from "./patch/config.mjs";
import { patchDataModels } from "./patch/dataModels.mjs";
import { patchPacks } from "./patch/packs.mjs";
import { patchManeuver } from "./patch/maneuver.mjs";
import { patchMedpac } from "./patch/medpac.mjs";
import { patchBlasterReload } from "./patch/blaster-reload.mjs";
import { patchChassisItemSheet } from "./patch/chassis-item-sheet.mjs";
import { patchPowercasting } from "./patch/powercasting.mjs";
import { patchProficiencyInit, patchProficiencyReady } from "./patch/proficiency.mjs";
import { patchProperties } from "./patch/properties.mjs";
import { patchStarshipCreate } from "./patch/starship-create.mjs";
import { patchStarshipPrepare } from "./patch/starship-prepare.mjs";
import { patchStarshipSheet } from "./patch/starship-sheet.mjs";
import * as migrations from "./migration.mjs";
import { handleTemplates } from "./templates.mjs";
import { chassisApi } from "./chassis.mjs";
import { registerModuleSettings } from "./settings.mjs";

globalThis.sw5e = {
	migrations,
	chassis: chassisApi
};

const strict = true;

Hooks.once('init', async function() {
	// Register Module Settings
	registerModuleSettings();
	// Register lib-wrapper hooks
	addHooks();
	// Pre-load templates
	handleTemplates();

	patchConfig(CONFIG.DND5E, strict);
	registerCurrencyActorHooks();
	registerCurrencyTooltipHooks();
	patchDataModels();

	patchManeuver();
	patchMedpac();
	patchBlasterReload();
	patchPowercasting();
	patchProficiencyInit();
	patchProperties();
	patchChassisItemSheet();
	patchStarshipCreate();
	patchStarshipPrepare();
	patchStarshipSheet();
});

Hooks.once('ready', async function() {
	patchPacks(strict);
	patchProficiencyReady();

	// Perform module migration if it is required and feasible
	if (migrations.needsMigration()) await migrations.migrateWorld();
	await syncWorldActorCurrencyWallets();
});
