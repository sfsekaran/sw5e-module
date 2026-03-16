import { getModulePath } from "./module-support.mjs";
import { convertLegacyWorldPayload } from "./migration.mjs";

const DEFAULT_PAYLOAD = `{
  "actors": [],
  "items": [],
  "scenes": [],
  "journalEntries": [],
  "rollTables": [],
  "macros": [],
  "compendia": []
}`;

function renderReportHtml(report) {
	const errors = report.errors.length
		? `<ul>${report.errors.map(err => `<li>${foundry.utils.escapeHTML(err)}</li>`).join("")}</ul>`
		: "<p>None</p>";
	const warnings = report.warnings.length
		? `<ul>${report.warnings.map(warn => `<li>${foundry.utils.escapeHTML(warn)}</li>`).join("")}</ul>`
		: "<p>None</p>";

	return `
		<section class="sw5e-world-conversion-report">
			<p><strong>Created:</strong> ${report.created} &nbsp; <strong>Updated:</strong> ${report.updated} &nbsp; <strong>Skipped:</strong> ${report.skipped}</p>
			<p><strong>Processed:</strong> Actors ${report.processed.Actor}, Items ${report.processed.Item}, Scenes ${report.processed.Scene}, Journals ${report.processed.JournalEntry}, Tables ${report.processed.RollTable}, Macros ${report.processed.Macro}, Compendium Entries ${report.processed.Compendium}</p>
			<h3>Warnings</h3>
			${warnings}
			<h3>Errors</h3>
			${errors}
		</section>
	`;
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Sw5eWorldConversionApp extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "sw5e-world-conversion",
		tag: "section",
		classes: ["sw5e-world-conversion"],
		window: {
			title: "SW5E Legacy World Conversion",
			resizable: true
		},
		position: {
			width: 820,
			height: "auto"
		}
	};

	static PARTS = {
		form: {
			template: getModulePath("templates/apps/world-conversion.hbs")
		}
	};

	async _prepareContext(options={}) {
		return {
			payloadExample: DEFAULT_PAYLOAD
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		const form = root?.querySelector("form.sw5e-world-conversion-form");
		if ( !form || form.dataset.sw5eBound === "true" ) return;
		form.dataset.sw5eBound = "true";
		form.addEventListener("submit", this.#onSubmit.bind(this));
	}

	async #onSubmit(event) {
		event.preventDefault();
		if ( !game.user?.isGM ) throw new Error("Only a GM can run world conversion.");

		const form = event.currentTarget;
		const formData = new FormData(form);
		const payloadText = String(formData.get("payload") ?? "").trim();
		if ( !payloadText ) {
			ui.notifications.warn("Paste a legacy world JSON payload before running conversion.");
			return;
		}

		let payload;
		try {
			payload = JSON.parse(payloadText);
		} catch ( err ) {
			ui.notifications.error(`Invalid JSON payload: ${err.message}`);
			return;
		}

		const optionsForConversion = {
			replaceExisting: formData.has("options.replaceExisting"),
			includeCompendia: formData.has("options.includeCompendia"),
			dryRun: formData.has("options.dryRun")
		};

		ui.notifications.info("Running SW5E legacy world conversion...");
		try {
			const report = await convertLegacyWorldPayload(payload, optionsForConversion);
			const title = optionsForConversion.dryRun
				? "SW5E Conversion Dry Run Report"
				: "SW5E Conversion Report";
			await Dialog.prompt({
				title,
				content: renderReportHtml(report),
				callback: () => {}
			});
			if ( report.errors.length ) ui.notifications.warn(`Conversion completed with ${report.errors.length} errors.`);
			else ui.notifications.info("SW5E conversion completed.");
		} catch ( err ) {
			console.error(err);
			ui.notifications.error(`SW5E conversion failed: ${err.message}`);
		}
	}
}

export function openWorldConversionTool() {
	if ( !game.user?.isGM ) {
		ui.notifications.warn("Only a GM can open SW5E world conversion.");
		return;
	}
	new Sw5eWorldConversionApp().render(true);
}
