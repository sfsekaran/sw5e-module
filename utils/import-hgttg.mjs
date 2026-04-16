import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWeaponProficiencyValue } from "../scripts/proficiency-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const LEGACY_DB_PATH = path.join(ROOT, ".hgttg-import", "packs", "heretics-guide-to-the-galaxy.db");
const LEGACY_ICON_DIR = path.join(ROOT, ".hgttg-import", "packs", "Icons");
const CORE_SPECIES_DIR = path.join(ROOT, "packs", "_source", "species");
const CORE_SPECIES_FEATURES_DIR = path.join(ROOT, "packs", "_source", "speciesfeatures");
const HGTTG_SPECIES_DIR = path.join(ROOT, "packs", "_source", "hgttgspecies");
const HGTTG_SPECIES_FEATURES_DIR = path.join(ROOT, "packs", "_source", "hgttgspeciesfeatures");
const ICON_DEST_DIR = path.join(ROOT, "icons", "packs", "Species");
const ARGS = new Set(process.argv.slice(2));
const HGTTG_SPECIES_FEATURES_PACK = "hgttgspeciesfeatures";

const CORE_VERSION = "12.331";
const SYSTEM_ID = "dnd5e";
const SYSTEM_VERSION = "5.2.5";
const LAST_MODIFIED_BY = "dnd5ebuilder0000";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ABILITY_MAP = {
	strength: "str",
	dexterity: "dex",
	constitution: "con",
	intelligence: "int",
	wisdom: "wis",
	charisma: "cha"
};
const SIZE_MAP = {
	tiny: "tiny",
	sm: "sm",
	small: "sm",
	med: "med",
	medium: "med",
	lg: "lg",
	large: "lg"
};
const SKILL_MAP = {
	acrobatics: "acr",
	"animal handling": "ani",
	athletics: "ath",
	deception: "dec",
	insight: "ins",
	intimidation: "itm",
	investigation: "inv",
	lore: "lor",
	medicine: "med",
	nature: "nat",
	perception: "prc",
	performance: "prf",
	persuasion: "per",
	piloting: "pil",
	"sleight of hand": "slt",
	stealth: "ste",
	survival: "sur",
	technology: "tec"
};

function hashToId(seed, length=16) {
	const hex = crypto.createHash("sha1").update(seed).digest("hex");
	let value = BigInt(`0x${hex}`);
	let encoded = "";
	while ( value > 0n ) {
		const index = Number(value % 62n);
		encoded = BASE62[index] + encoded;
		value /= 62n;
	}
	encoded = encoded || "0";
	if ( encoded.length >= length ) return encoded.slice(0, length);
	return encoded.padStart(length, "0");
}

function slugify(value) {
	return String(value ?? "")
		.normalize("NFKD")
		.replace(/[^\w\s-]/g, " ")
		.toLowerCase()
		.replace(/[_\s]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function normalizeWhitespace(value) {
	return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
	return String(value ?? "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, "\"")
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&rsquo;|&lsquo;/gi, "'")
		.replace(/&rdquo;|&ldquo;/gi, "\"")
		.replace(/&ndash;/gi, "-")
		.replace(/&mdash;/gi, "-")
		.replace(/&hellip;/gi, "...")
		.replace(/&uuml;/gi, "u")
		.replace(/&ouml;/gi, "o")
		.replace(/&auml;/gi, "a")
		.replace(/&eacute;/gi, "e")
		.replace(/&agrave;/gi, "a")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">");
}

function stripTags(value) {
	return normalizeWhitespace(decodeEntities(String(value ?? "").replace(/<[^>]+>/g, " ")));
}

function extractFeatureParagraphs(html) {
	const normalized = String(html ?? "").replace(/<p\b[^>]*>/gi, "\n<p>");
	return normalized
		.split("\n")
		.map(part => part.trim())
		.filter(Boolean)
		.filter(part => part.startsWith("<p>"))
		.map(part => part.endsWith("</p>") ? part : `${part}</p>`);
}

function extractFeatureTitle(featureHtml) {
	const strong = featureHtml.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1];
	const raw = strong ? stripTags(strong) : stripTags(featureHtml).split(".")[0];
	return normalizeWhitespace(raw.replace(/[.:]$/, ""));
}

function buildSafeFeatureSlug(featureTitle, { maxLength=64 }={}) {
	const rawSlug = slugify(featureTitle) || "feature";
	if ( rawSlug.length <= maxLength ) return rawSlug;
	const hashSuffix = hashToId(`hgttg:feature-slug:${featureTitle}`, 8).toLowerCase();
	const prefixLength = Math.max(8, maxLength - hashSuffix.length - 1);
	return `${rawSlug.slice(0, prefixLength).replace(/-+$/g, "")}-${hashSuffix}`;
}

function buildStats() {
	return {
		duplicateSource: null,
		coreVersion: CORE_VERSION,
		systemId: SYSTEM_ID,
		systemVersion: SYSTEM_VERSION,
		createdTime: null,
		modifiedTime: null,
		lastModifiedBy: LAST_MODIFIED_BY
	};
}

function buildEffectStats() {
	return {
		coreVersion: "12.330",
		systemId: null,
		systemVersion: null,
		createdTime: null,
		modifiedTime: null,
		lastModifiedBy: null,
		compendiumSource: null,
		duplicateSource: null
	};
}

function buildFeatureItem({ speciesName, speciesSlug, featureTitle, featureSlug, featureHtml, imgPath, sourceText }) {
	const id = hashToId(`hgttg:feature:${speciesSlug}:${featureSlug}`);
	return {
		name: featureTitle,
		flags: {
			"sw5e-importer": {
				timestamp: new Date().toISOString(),
				importer_version: 4,
				uid: `Feature.name-${featureSlug}.source-species.sourceName-${speciesSlug}`
			}
		},
		type: "feat",
		img: imgPath,
		system: {
			description: {
				value: featureHtml,
				chat: ""
			},
			requirements: speciesName,
			source: {
				custom: sourceText,
				revision: 1,
				rules: "2024"
			},
			type: {
				value: "species",
				subtype: ""
			},
			uses: {
				spent: 0,
				recovery: []
			},
			activities: [],
			identifier: featureSlug,
			enchant: {},
			prerequisites: {
				level: null
			},
			properties: []
		},
		effects: [],
		_id: id,
		folder: null,
		sort: 0,
		ownership: {
			default: 0
		},
		_stats: buildStats(),
		_key: `!items!${id}`
	};
}

function buildRaceItem({
	legacyItem,
	speciesSlug,
	imgPath,
	featureItems,
	advancement,
	movement,
	senses,
	effectChanges
}) {
	const id = hashToId(`hgttg:species:${speciesSlug}`);
	const sourceText = legacyItem.data?.source || "HGTTG";
	const effectId = hashToId(`hgttg:species:${speciesSlug}:effect`);
	return {
		name: legacyItem.name,
		flags: {
			"sw5e-importer": {
				timestamp: new Date().toISOString(),
				importer_version: 4,
				uid: `Species.name-${speciesSlug}`
			}
		},
		type: "race",
		img: imgPath,
		system: {
			description: {
				value: legacyItem.data?.description?.value ?? "",
				chat: legacyItem.data?.description?.chat ?? ""
			},
			source: {
				custom: sourceText
			},
			identifier: speciesSlug,
			details: {
				isDroid: false
			},
			type: {
				value: "humanoid"
			},
			movement,
			senses,
			advancement,
			skinColorOptions: {
				value: legacyItem.data?.skinColorOptions?.value ?? ""
			},
			hairColorOptions: {
				value: legacyItem.data?.hairColorOptions?.value ?? ""
			},
			eyeColorOptions: {
				value: legacyItem.data?.eyeColorOptions?.value ?? ""
			},
			colorScheme: {
				value: ""
			},
			distinctions: {
				value: legacyItem.data?.distinctions?.value ?? ""
			},
			heightAverage: {
				value: legacyItem.data?.heightAverage?.value ?? ""
			},
			heightRollMod: {
				value: legacyItem.data?.heightRollMod?.value ?? ""
			},
			weightAverage: {
				value: legacyItem.data?.weightAverage?.value ?? ""
			},
			weightRollMod: {
				value: legacyItem.data?.weightRollMod?.value ?? ""
			},
			homeworld: {
				value: legacyItem.data?.homeworld?.value ?? ""
			},
			slanguage: {
				value: legacyItem.data?.slanguage?.value ?? ""
			},
			droidDistinctions: {
				value: ""
			},
			manufacturer: {
				value: ""
			},
			droidLanguage: {
				value: ""
			}
		},
		effects: effectChanges.length ? [{
			_id: effectId,
			changes: effectChanges,
			disabled: false,
			duration: {
				startTime: null,
				seconds: null,
				combat: null,
				rounds: null,
				turns: null,
				startRound: null,
				startTurn: null
			},
			tint: "#ffffff",
			transfer: true,
			flags: {},
			origin: null,
			name: legacyItem.name,
			description: "",
			statuses: [],
			_stats: buildEffectStats(),
			img: imgPath,
			type: "base",
			system: {},
			sort: 0,
			_key: `!items.effects!${id}.${effectId}`
		}] : [],
		_id: id,
		folder: null,
		sort: 0,
		ownership: {
			default: 0
		},
		_stats: buildStats(),
		_key: `!items!${id}`
	};
}

function parseAbilityScoreAdvancement(featureText, effectAbilityBonuses) {
	const fixed = {};
	let points = 0;
	const plain = normalizeWhitespace(stripTags(featureText));

	const choicePatterns = [
		[/one ability score of your choice increases by 2/gi, 2],
		[/one other ability score of your choice increases by 1/gi, 1],
		[/two other ability scores of your choice increase by 1/gi, 2],
		[/three different ability scores of your choice increase by 1/gi, 3],
		[/four ability scores of your choice each increase by 1/gi, 4]
	];
	for ( const [pattern, value] of choicePatterns ) {
		if ( pattern.test(plain) ) points += value;
	}

	for ( const match of plain.matchAll(/\b(?:your|you)\s+([a-z ,'-]+?)\s+score increases? by\s+(\d+)/gi) ) {
		const amount = Number(match[2] ?? 0);
		if ( !amount ) continue;
		const segment = normalizeWhitespace(match[1].toLowerCase());
		if ( segment.includes("ability score of your choice") ) continue;
		if ( segment.includes(" or ") || segment.includes(",") ) {
			points += amount;
			continue;
		}
		const ability = ABILITY_MAP[segment];
		if ( ability ) fixed[ability] = (fixed[ability] ?? 0) + amount;
	}

	if ( !Object.keys(fixed).length && !points ) {
		for ( const [ability, amount] of Object.entries(effectAbilityBonuses) ) {
			if ( !amount ) continue;
			fixed[ability] = amount;
		}
	}

	return {
		_id: hashToId(`hgttg:adv:asi:${plain}`),
		configuration: {
			fixed,
			points,
			cap: 2,
			locked: []
		},
		level: 0,
		type: "AbilityScoreImprovement",
		value: {
			type: "asi"
		}
	};
}

function buildSizeAdvancement(size) {
	return {
		_id: hashToId(`hgttg:adv:size:${size}`),
		configuration: {
			sizes: [size]
		},
		level: 0,
		type: "Size",
		value: {}
	};
}

function buildItemGrantAdvancement(speciesFeatures) {
	return {
		_id: hashToId(`hgttg:adv:itemgrant:${speciesFeatures.map(item => item._id).join(":")}`),
		configuration: {
			items: speciesFeatures.map(item => ({
				uuid: `Compendium.sw5e-module.${HGTTG_SPECIES_FEATURES_PACK}.${item._id}`,
				optional: false
			})),
			optional: true,
			spell: null
		},
		level: 0,
		title: "Features",
		type: "ItemGrant",
		value: {}
	};
}

function collectChoicePools(featureTexts) {
	const choiceMap = new Map();
	const addChoice = (count, pool) => {
		const key = `${count}:${pool.join("|")}`;
		if ( choiceMap.has(key) ) return;
		choiceMap.set(key, { count, pool });
	};

	for ( const text of featureTexts ) {
		const plain = normalizeWhitespace(stripTags(text)).toLowerCase();
		if ( /one skill of your choice/.test(plain) ) addChoice(1, ["skills:*"]);
		if ( /one tool of your choice/.test(plain) ) addChoice(1, ["tool:*"]);
		if ( /one weapon of your choice/.test(plain) ) addChoice(1, ["weapon:*"]);
		if ( /one artisan'?s implements of your choice/.test(plain) ) addChoice(1, ["tool:art:*"]);
		if ( /one musical instrument of your choice/.test(plain) ) addChoice(1, ["tool:music:*"]);
		if ( /one gaming set of your choice/.test(plain) ) addChoice(1, ["tool:game:*"]);
		if ( /one kit of your choice/.test(plain) ) addChoice(1, ["tool:kit:*"]);

		const skillMatch = plain.match(/proficiency in ([a-z' -]+?) or ([a-z' -]+?)(?: skill)?(?: \(your choice\))?[.]/);
		if ( skillMatch ) {
			const first = SKILL_MAP[normalizeWhitespace(skillMatch[1])];
			const second = SKILL_MAP[normalizeWhitespace(skillMatch[2])];
			if ( first && second ) addChoice(1, [`skills:${first}`, `skills:${second}`]);
		}
	}

	return Array.from(choiceMap.values());
}

function buildTraitAdvancement(grants, choices) {
	if ( !grants.length && !choices.length ) return null;
	return {
		_id: hashToId(`hgttg:adv:traits:${grants.join(":")}:${JSON.stringify(choices)}`),
		configuration: {
			choices,
			grants,
			mode: "default",
			allowReplacements: false
		},
		level: 0,
		type: "Trait",
		value: {
			chosen: []
		}
	};
}

function parseLegacyEffects(legacyItem, featureTexts) {
	const grants = new Set();
	const residualChanges = [];
	const effectAbilityBonuses = {};

	const movement = {
		walk: 30,
		burrow: null,
		climb: null,
		fly: null,
		swim: null,
		units: null,
		hover: false
	};
	const senses = {
		darkvision: null,
		blindsight: null,
		tremorsense: null,
		truesight: null,
		units: null,
		special: ""
	};
	let size = "med";

	for ( const effect of legacyItem.effects ?? [] ) {
		for ( const change of effect.changes ?? [] ) {
			if ( !change?.key ) continue;
			const key = String(change.key).replace(/^data\./, "system.");
			const value = change.value;

			if ( key === "system.details.species" ) continue;
			if ( key === "system.traits.languages.value" ) continue;
			if ( key === "system.traits.languages.custom" ) continue;

			const abilityMatch = key.match(/^system\.abilities\.(str|dex|con|int|wis|cha)\.value$/);
			if ( abilityMatch ) {
				effectAbilityBonuses[abilityMatch[1]] = Number(value ?? 0);
				continue;
			}

			const movementMatch = key.match(/^system\.attributes\.movement\.(walk|burrow|climb|fly|swim)$/);
			if ( movementMatch ) {
				const type = movementMatch[1];
				movement[type] = Number(value ?? 0) || null;
				continue;
			}

			const senseMatch = key.match(/^system\.attributes\.senses\.(darkvision|blindsight|tremorsense|truesight)$/);
			if ( senseMatch ) {
				const type = senseMatch[1];
				senses[type] = Number(value ?? 0) || null;
				continue;
			}

			if ( key === "system.traits.size" ) {
				size = SIZE_MAP[String(value).toLowerCase()] ?? "med";
				continue;
			}

			const skillMatch = key.match(/^system\.skills\.([a-z]{3})\.value$/);
			if ( skillMatch && Number(value ?? 0) >= 1 ) {
				grants.add(`skills:${skillMatch[1]}`);
				continue;
			}

			if ( key === "system.traits.weaponProf.custom" && value ) {
				grants.add(`weapon:${normalizeWeaponProficiencyValue(String(value))}`);
				continue;
			}

			if ( key === "system.traits.toolProf.custom" && value ) {
				residualChanges.push({
					key,
					mode: change.mode,
					priority: change.priority ?? 20,
					value: String(value)
				});
				continue;
			}

			const traitGrantMatch = key.match(/^system\.traits\.(dr|di|dv|ci)\.value$/);
			if ( traitGrantMatch && value ) {
				const prefix = traitGrantMatch[1];
				for ( const part of String(value).split(/[;,]/).map(item => normalizeWhitespace(item)).filter(Boolean) ) {
					grants.add(`${prefix}:${part.toLowerCase()}`);
				}
				continue;
			}

			residualChanges.push({
				key,
				mode: change.mode,
				priority: change.priority ?? 20,
				value: String(value ?? "")
			});
		}
	}

	const choices = collectChoicePools(featureTexts);

	return {
		effectAbilityBonuses,
		grants: Array.from(grants),
		choices,
		residualChanges,
		movement,
		senses,
		size
	};
}

async function readCurrentSpeciesNames() {
	const names = new Set();
	for ( const entry of await fs.readdir(CORE_SPECIES_DIR) ) {
		if ( !entry.endsWith(".json") ) continue;
		const filePath = path.join(CORE_SPECIES_DIR, entry);
		const json = JSON.parse(await fs.readFile(filePath, "utf8"));
		names.add(normalizeWhitespace(json.name).toLowerCase());
	}
	return names;
}

async function loadLegacySpecies() {
	const raw = await fs.readFile(LEGACY_DB_PATH, "utf8");
	return raw
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean)
		.map(line => JSON.parse(line))
		.filter(entry => entry.type === "species");
}

async function writeJson(filePath, data) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readJsonFilesFromDirectory(directoryPath) {
	try {
		return await fs.readdir(directoryPath);
	} catch {
		return [];
	}
}

async function cleanGeneratedImports() {
	const cleanupTargets = [
		{ speciesDir: CORE_SPECIES_DIR, featureDir: CORE_SPECIES_FEATURES_DIR },
		{ speciesDir: HGTTG_SPECIES_DIR, featureDir: HGTTG_SPECIES_FEATURES_DIR }
	];

	for ( const { speciesDir, featureDir } of cleanupTargets ) {
		for ( const entry of await readJsonFilesFromDirectory(speciesDir) ) {
			if ( !entry.endsWith(".json") ) continue;
			const filePath = path.join(speciesDir, entry);
			const json = JSON.parse(await fs.readFile(filePath, "utf8"));
			if ( json.system?.source?.custom !== "HGTTG" ) continue;

			const identifier = json.system?.identifier || path.basename(entry, ".json");
			const imgFileName = path.basename(String(json.img ?? ""));

			await fs.rm(filePath, { force: true });
			await fs.rm(path.join(featureDir, identifier), { recursive: true, force: true });
			if ( imgFileName ) await fs.rm(path.join(ICON_DEST_DIR, imgFileName), { force: true });
		}
	}
}

async function main() {
	if ( ARGS.has("--clean") ) {
		await cleanGeneratedImports();
		console.log("Removed generated HGTTG imports.");
		return;
	}

	const currentSpeciesNames = await readCurrentSpeciesNames();
	const legacySpecies = await loadLegacySpecies();
	const netNewSpecies = legacySpecies.filter(item => !currentSpeciesNames.has(normalizeWhitespace(item.name).toLowerCase()));

	await fs.mkdir(ICON_DEST_DIR, { recursive: true });

	let speciesCount = 0;
	let featureCount = 0;
	let iconCount = 0;

	for ( const legacyItem of netNewSpecies ) {
		const speciesSlug = slugify(legacyItem.name);
		const encodedIconName = path.basename(String(legacyItem.img ?? "").replace(/^modules\/hgttg\/packs\/Icons\//i, "")) || `${legacyItem.name}.webp`;
		const legacyIconName = decodeURIComponent(encodedIconName);
		const legacyIconPath = path.join(LEGACY_ICON_DIR, legacyIconName);
		const iconDestPath = path.join(ICON_DEST_DIR, legacyIconName);
		const imgPath = `modules/sw5e-module/icons/packs/Species/${legacyIconName.replace(/\\/g, "/")}`;

		await fs.copyFile(legacyIconPath, iconDestPath);
		iconCount += 1;

		const featureParagraphs = extractFeatureParagraphs(legacyItem.data?.traits?.value ?? "");
		const featureItems = [];
		const seenFeatureSlugs = new Set();

		for ( const featureHtml of featureParagraphs ) {
			const featureTitle = extractFeatureTitle(featureHtml);
			if ( !featureTitle ) continue;
			let featureSlug = buildSafeFeatureSlug(featureTitle);
			if ( !featureSlug ) featureSlug = "feature";
			let featureSlugCandidate = featureSlug;
			let index = 2;
			while ( seenFeatureSlugs.has(featureSlugCandidate) ) {
				featureSlugCandidate = `${featureSlug}-${index}`;
				index += 1;
			}
			seenFeatureSlugs.add(featureSlugCandidate);

			const featureItem = buildFeatureItem({
				speciesName: legacyItem.name,
				speciesSlug,
				featureTitle,
				featureSlug: featureSlugCandidate,
				featureHtml,
				imgPath,
				sourceText: legacyItem.data?.source || "HGTTG"
			});
			featureItems.push(featureItem);

			const featurePath = path.join(HGTTG_SPECIES_FEATURES_DIR, speciesSlug, `${featureSlugCandidate}.json`);
			await writeJson(featurePath, featureItem);
			featureCount += 1;
		}

		const featureTexts = featureItems.map(item => item.system.description.value);
		const effectsSummary = parseLegacyEffects(legacyItem, featureTexts);

		const abilityFeature = featureItems.find(item => item.system.identifier === "ability-score-increase");
		const abilityAdvancement = parseAbilityScoreAdvancement(
			abilityFeature?.system?.description?.value ?? "",
			effectsSummary.effectAbilityBonuses
		);

		const advancement = [
			buildItemGrantAdvancement(featureItems),
			abilityAdvancement,
			buildSizeAdvancement(effectsSummary.size)
		];

		const traitAdvancement = buildTraitAdvancement(effectsSummary.grants, effectsSummary.choices);
		if ( traitAdvancement ) advancement.push(traitAdvancement);

		const speciesItem = buildRaceItem({
			legacyItem,
			speciesSlug,
			imgPath,
			featureItems,
			advancement,
			movement: effectsSummary.movement,
			senses: effectsSummary.senses,
			effectChanges: effectsSummary.residualChanges
		});

		await writeJson(path.join(HGTTG_SPECIES_DIR, `${speciesSlug}.json`), speciesItem);
		speciesCount += 1;
	}

	console.log(`Imported ${speciesCount} species, ${featureCount} features, and ${iconCount} icons.`);
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
