import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../packs/_source");
const NPC_PACKS = new Set(["monsters", "fistoscodex", "mandaloriancodexnpcs"]);
const WEAPON_PACKS = new Map([
	["blasters", "weapon"],
	["lightweapons", "weapon"],
	["vibroweapons", "weapon"]
]);
const AMMO_PACKS = new Map([
	["powerCell", { pack: "ammo", relativePath: ["powerCell", "power-cell.json"] }],
	["cartridge", { pack: "ammo", relativePath: ["cartridge", "slug-cartridge.json"] }]
]);
const ATTACK_ACTION_TYPES = new Set(["mwak", "rwak", "mpak", "rpak"]);

let cachedLookup = null;
let cachedStats = null;

function cloneData(data) {
	return data === undefined ? undefined : JSON.parse(JSON.stringify(data));
}

function normalizeName(name) {
	return String(name ?? "")
		.toLowerCase()
		.replace(/['’]/gu, "")
		.replace(/[^a-z0-9]+/gi, " ")
		.trim();
}

function compactName(name) {
	return normalizeName(name).replace(/\s+/gu, "");
}

function stripTrailingQualifiers(name) {
	let value = String(name ?? "").trim();
	if ( !value ) return "";
	let previous = "";
	while ( value && (value !== previous) ) {
		previous = value;
		value = value
			.replace(/\s*\([^()]*\)\s*[.!,:;/-]*\s*$/u, "")
			.replace(/\s*[.!,:;/-]+\s*$/u, "")
			.trim();
	}
	return value;
}

function addAliasKey(lookup, key, record) {
	if ( !key || lookup.has(key) ) return;
	lookup.set(key, record);
}

function getLookupKeys(name, { allowQualifierStripping=false }={}) {
	const keys = new Set();
	const normalized = normalizeName(name);
	const compact = compactName(name);
	if ( normalized ) keys.add(normalized);
	if ( compact ) keys.add(compact);
	if ( !allowQualifierStripping ) return [...keys];

	const stripped = stripTrailingQualifiers(name);
	if ( stripped && (stripped !== String(name ?? "").trim()) ) {
		const strippedNormalized = normalizeName(stripped);
		const strippedCompact = compactName(stripped);
		if ( strippedNormalized ) keys.add(strippedNormalized);
		if ( strippedCompact ) keys.add(strippedCompact);
	}
	return [...keys];
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walkJsonFiles(rootPath) {
	const output = [];
	for ( const entry of fs.readdirSync(rootPath, { withFileTypes: true }) ) {
		const entryPath = path.join(rootPath, entry.name);
		if ( entry.isDirectory() ) output.push(...walkJsonFiles(entryPath));
		else if ( entry.isFile() && path.extname(entry.name) === ".json" ) output.push(entryPath);
	}
	return output;
}

function ensureStats() {
	cachedStats ??= {
		matchedEntries: 0,
		actorsChanged: 0,
		weaponsAdded: 0,
		weaponsUpdated: 0,
		ammoAdded: 0
	};
	return cachedStats;
}

export function resetNpcWeaponBackfillStats() {
	cachedStats = null;
}

export function getNpcWeaponBackfillStats() {
	return cloneData(ensureStats());
}

function buildLookup() {
	const weaponByName = new Map();
	const ammoByType = new Map();

	for ( const [packName] of WEAPON_PACKS ) {
		for ( const filePath of walkJsonFiles(path.join(PACK_ROOT, packName)) ) {
			const item = readJson(filePath);
			if ( item?.type !== "weapon" ) continue;

			const record = {
				packName,
				filePath,
				item,
				baseItem: item.system?.type?.baseItem ?? ""
			};
			for ( const key of getLookupKeys(item.name) ) addAliasKey(weaponByName, key, record);
			for ( const key of getLookupKeys(record.baseItem) ) addAliasKey(weaponByName, key, record);
		}
	}

	for ( const [ammoType, config] of AMMO_PACKS ) {
		const filePath = path.join(PACK_ROOT, config.pack, ...config.relativePath);
		ammoByType.set(ammoType, {
			packName: config.pack,
			filePath,
			item: readJson(filePath)
		});
	}

	return { weaponByName, ammoByType };
}

function getLookup() {
	cachedLookup ??= buildLookup();
	return cachedLookup;
}

function isEligibleAttackItem(item) {
	if ( !item || (item.type === "weapon") ) return false;
	const system = item.system ?? {};
	if ( !ATTACK_ACTION_TYPES.has(system.actionType) ) return false;
	return Array.isArray(system.damage?.parts) && (system.damage.parts.length > 0);
}

function hasMatchingAmmo(items, ammoType) {
	return items.some(item =>
		item?.type === "consumable"
		&& item.system?.type?.value === "ammo"
		&& item.system?.type?.subtype === ammoType
	);
}

function createEmbeddedId(actor, sourceItem, suffix) {
	return crypto
		.createHash("sha1")
		.update(`${actor._id}:${sourceItem._id}:${suffix}`)
		.digest("hex")
		.slice(0, 16);
}

function mergeFlags(...flagSets) {
	return flagSets.reduce((merged, flags) => {
		if ( !flags || (typeof flags !== "object") ) return merged;
		for ( const [key, value] of Object.entries(flags) ) {
			if ( value && (typeof value === "object") && !Array.isArray(value) && merged[key] && (typeof merged[key] === "object") ) {
				merged[key] = mergeFlags(merged[key], value);
			} else {
				merged[key] = cloneData(value);
			}
		}
		return merged;
	}, {});
}

function buildWeaponSystem(sourceWeaponSystem, sourceAttackSystem, existingWeaponSystem={}) {
	const system = cloneData(sourceWeaponSystem) ?? {};
	const sourceAttack = sourceAttackSystem ?? {};
	const existingWeapon = existingWeaponSystem ?? {};

	system.description = cloneData(existingWeapon.description ?? sourceAttack.description ?? system.description);
	system.source = cloneData(existingWeapon.source ?? system.source);
	system.quantity = existingWeapon.quantity ?? system.quantity ?? 1;
	system.weight = cloneData(existingWeapon.weight ?? system.weight);
	system.price = cloneData(existingWeapon.price ?? system.price);
	system.equipped = existingWeapon.equipped ?? true;
	system.target = cloneData(sourceAttack.target ?? existingWeapon.target ?? system.target);
	system.range = cloneData(sourceAttack.range ?? existingWeapon.range ?? system.range);
	system.ability = sourceAttack.ability ?? existingWeapon.ability ?? system.ability ?? "";
	system.actionType = sourceAttack.actionType ?? existingWeapon.actionType ?? system.actionType ?? "";
	system.chatFlavor = sourceAttack.chatFlavor ?? existingWeapon.chatFlavor ?? system.chatFlavor ?? "";
	system.critical = cloneData(sourceAttack.critical ?? existingWeapon.critical ?? system.critical);
	system.damage = cloneData(sourceAttack.damage ?? existingWeapon.damage ?? system.damage);
	system.formula = sourceAttack.formula ?? existingWeapon.formula ?? system.formula ?? "";
	system.save = cloneData(sourceAttack.save ?? existingWeapon.save ?? system.save);
	system.attack = cloneData(sourceAttack.attack ?? existingWeapon.attack ?? system.attack);
	system.proficient = sourceAttack.proficient ?? existingWeapon.proficient ?? system.proficient ?? 1;
	delete system.activities;
	return system;
}

function buildWeaponItem(actor, sourceAttack, sourceWeaponRecord, existingWeapon) {
	const weaponSource = sourceWeaponRecord.item;
	const itemId = existingWeapon?._id ?? createEmbeddedId(actor, sourceAttack, "weapon");
	const weapon = {
		_id: itemId,
		name: sourceAttack.name,
		type: "weapon",
		sort: existingWeapon?.sort ?? sourceAttack.sort ?? 0,
		flags: mergeFlags(
			weaponSource.flags,
			existingWeapon?.flags,
			sourceAttack.flags,
			{ core: { sourceId: `Compendium.sw5e-module.${sourceWeaponRecord.packName}.Item.${weaponSource._id}` } }
		),
		img: existingWeapon?.img ?? sourceAttack.img ?? weaponSource.img,
		effects: cloneData(existingWeapon?.effects ?? sourceAttack.effects ?? []),
		folder: existingWeapon?.folder ?? sourceAttack.folder ?? null,
		system: buildWeaponSystem(weaponSource.system, sourceAttack.system, existingWeapon?.system),
		ownership: cloneData(existingWeapon?.ownership ?? sourceAttack.ownership ?? { default: 0 }),
		_stats: cloneData(existingWeapon?._stats ?? sourceAttack._stats ?? {}),
		_key: existingWeapon?._key ?? `!actors.items!${actor._id}.${itemId}`
	};
	return weapon;
}

function buildAmmoItem(actor, sourceAttack, ammoRecord) {
	const ammoSource = ammoRecord.item;
	const itemId = createEmbeddedId(actor, sourceAttack, ammoRecord.item.system?.type?.subtype ?? "ammo");
	return {
		_id: itemId,
		name: ammoSource.name,
		type: ammoSource.type,
		sort: sourceAttack.sort ?? 0,
		flags: mergeFlags(ammoSource.flags, {
			core: { sourceId: `Compendium.sw5e-module.${ammoRecord.packName}.Item.${ammoSource._id}` }
		}),
		img: ammoSource.img,
		effects: cloneData(ammoSource.effects ?? []),
		folder: null,
		system: cloneData(ammoSource.system),
		ownership: { default: 0 },
		_stats: cloneData(sourceAttack._stats ?? {}),
		_key: `!actors.items!${actor._id}.${itemId}`
	};
}

function getActorItems(actor) {
	if ( !Array.isArray(actor.items) ) actor.items = [];
	return actor.items;
}

export function backfillNpcWeapons(actor, { packName }={}) {
	if ( actor?.type !== "npc" ) return false;
	if ( !NPC_PACKS.has(packName) ) return false;

	const { weaponByName, ammoByType } = getLookup();
	const items = getActorItems(actor);
	const stats = ensureStats();
	let actorChanged = false;

	for ( const item of [...items] ) {
		if ( !isEligibleAttackItem(item) ) continue;

		const matchKeys = getLookupKeys(item.name, { allowQualifierStripping: true });
		const weaponRecord = matchKeys.map(key => weaponByName.get(key)).find(Boolean);
		if ( !weaponRecord ) continue;

		stats.matchedEntries += 1;

		const existingWeapon = items.find(candidate =>
			(candidate !== item)
			&& candidate?.type === "weapon"
			&& getLookupKeys(candidate.name, { allowQualifierStripping: true }).some(key => matchKeys.includes(key))
		);

		const nextWeapon = buildWeaponItem(actor, item, weaponRecord, existingWeapon);
		if ( existingWeapon ) {
			const targetIndex = items.indexOf(existingWeapon);
			items[targetIndex] = nextWeapon;
			stats.weaponsUpdated += 1;
		} else {
			items.push(nextWeapon);
			stats.weaponsAdded += 1;
		}
		actorChanged = true;

		for ( const ammoType of nextWeapon.system?.ammo?.types ?? [] ) {
			const ammoRecord = ammoByType.get(ammoType);
			if ( !ammoRecord || hasMatchingAmmo(items, ammoType) ) continue;
			items.push(buildAmmoItem(actor, item, ammoRecord));
			stats.ammoAdded += 1;
			actorChanged = true;
		}
	}

	if ( actorChanged ) stats.actorsChanged += 1;
	return actorChanged;
}
