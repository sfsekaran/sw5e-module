import { Sw5eWorldConversionApp } from "./world-conversion.mjs";
import { getModuleId } from "./module-support.mjs";

/**
 * Register all of the module's settings.
 */
export function registerModuleSettings() {
	// Internal Module Migration Version
	game.settings.register("sw5e", "moduleMigrationVersion", {
		name: "Module Migration Version",
		scope: "world",
		config: false,
		type: String,
		default: ""
	});

	game.settings.registerMenu(getModuleId(), "legacyWorldConversion", {
		name: "SW5E Legacy World Conversion",
		label: "Open Conversion Tool",
		hint: "Import and convert legacy sw5e world JSON into this dnd5e + sw5e-module world.",
		icon: "fas fa-shuttle-space",
		type: Sw5eWorldConversionApp,
		restricted: true
	});

	// // Allow 'feat + 1 ASI' variant rule
	// game.settings.register("sw5e", "allowFeatsAndASI", {
	//   name: "SETTINGS.5eFeatsAndASIN",
	//   hint: "SETTINGS.5eFeatsAndASIL",
	//   scope: "world",
	//   config: true,
	//   default: false,
	//   type: Boolean
	// });

	// // Simplified Forcecasting
	// game.settings.register("sw5e", "simplifiedForcecasting", {
	//   name: "SETTINGS.SWSimplifiedForcecastingN",
	//   hint: "SETTINGS.SWSimplifiedForcecastingL",
	//   scope: "world",
	//   config: true,
	//   type: Boolean,
	//   default: false
	// });

	// // Use old starship movement calculation rules
	// game.settings.register("sw5e", "oldStarshipMovement", {
	//   name: "SETTINGS.SWOldStarshipMovementN",
	//   hint: "SETTINGS.SWOldStarshipMovementL",
	//   scope: "world",
	//   config: true,
	//   type: Boolean,
	//   default: false
	// });

	// // NPCs consume ammo
	// game.settings.register("sw5e", "npcConsumeAmmo", {
	//   name: "SETTINGS.SWnpcConsumeAmmoN",
	//   hint: "SETTINGS.SWnpcConsumeAmmoL",
	//   scope: "world",
	//   config: true,
	//   type: Boolean,
	//   default: false
	// });
}
