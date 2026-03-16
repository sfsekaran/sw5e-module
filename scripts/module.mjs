import { addHooks } from "./patch/addHooks.mjs";
import { patchConfig } from "./patch/config.mjs";
import { patchDataModels } from "./patch/dataModels.mjs";
import { patchPacks } from "./patch/packs.mjs";
import { patchManeuver } from "./patch/maneuver.mjs";
import { patchMedpac } from "./patch/medpac.mjs";
import { patchBlasterReload } from "./patch/blaster-reload.mjs";
import { patchPowercasting } from "./patch/powercasting.mjs";
import { patchProficiencyInit, patchProficiencyReady } from "./patch/proficiency.mjs";
import { patchProperties } from "./patch/properties.mjs";
import { patchStarshipPrepare } from "./patch/starship-prepare.mjs";
import { patchStarshipSheet } from "./patch/starship-sheet.mjs";
import * as migrations from "./migration.mjs";
import { openWorldConversionTool } from "./world-conversion.mjs";
import { handleTemplates } from "./templates.mjs";
import { registerModuleSettings } from "./settings.mjs";

globalThis.sw5e = {
	migrations,
	openWorldConversionTool
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
	patchDataModels();

	patchManeuver();
	patchMedpac();
	patchBlasterReload();
	patchPowercasting();
	patchProficiencyInit();
	patchProperties();
	patchStarshipPrepare();
	patchStarshipSheet();
});

Hooks.once('ready', async function() {
	patchPacks(strict);
	patchProficiencyReady();

	// Perform module migration if it is required and feasible
	if (migrations.needsMigration()) migrations.migrateWorld();
});
