import { getModuleId } from "../module-support.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

const FORCE_RECOVERY_UID_FRAGMENT = "force_recovery";

/**
 * @param {import("@league/foundry").documents.Item} item
 */
function isForceRecoveryItem(item) {
	if ( !item || item.type !== "feat" ) return false;
	const uid = item.flags?.["sw5e-importer"]?.uid;
	if ( typeof uid === "string" && uid.includes(FORCE_RECOVERY_UID_FRAGMENT) ) return true;
	return item.name === "Force Recovery";
}

/**
 * @param {unknown} activity
 */
function isForceRecoveryUtilityActivity(activity) {
	return isForceRecoveryItem(activity?.item) && activity?.type === "utility";
}

/**
 * `dnd5e.preUseActivity` receives an Activity whose item is a clone used during the use pipeline.
 * Updates must target the real embedded Item on the actor (see dnd5e `Activity#use`).
 * @param {import("@league/foundry").documents.Activity} activity
 * @returns {import("@league/foundry").documents.Item|null}
 */
function getRealEmbeddedItemFromActivity(activity) {
	const probeItem = activity?.item;
	const id = probeItem?.id;
	const parent = probeItem?.parent;
	if ( !id || parent?.documentName !== "Actor" ) return null;
	return parent.items.get(id) ?? null;
}

/**
 * @param {object} activity
 */
function activityConsumptionUsesActivityUses(activity) {
	const targets = activity?.consumption?.targets;
	if ( !targets ) return false;
	return [...targets].some(t => t?.type === "activityUses");
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 */
function getConsularLevels(actor) {
	if ( !actor ) return 0;
	const classes = actor.itemTypes?.class ?? [];
	const consular = classes.find(c => c.system?.identifier === "consular");
	return Math.max(0, Number(consular?.system?.levels) || 0);
}

/**
 * @param {import("@league/foundry").documents.Item} item
 */
function parseItemUsesMax(item) {
	const raw = item?.system?.uses?.max;
	if ( raw == null || raw === "" ) return 0;
	if ( typeof raw === "number" && Number.isFinite(raw) ) return Math.max(0, raw);
	const rollData = item.getRollData?.() ?? item.parent?.getRollData?.() ?? {};
	try {
		return Math.max(0, Number(Roll.safeEval(String(raw), rollData)) || 0);
	} catch {
		return Math.max(0, Number(raw) || 0);
	}
}

/**
 * Remaining uses for Force Recovery, aligned with dnd5e 5.2 prepared uses (`uses.value`)
 * and consumption via `uses.spent` (item) or activity `uses.spent` (activityUses targets).
 * @param {import("@league/foundry").documents.Item} item
 * @param {string} activityId
 */
function getForceRecoveryUsesRemaining(item, activityId) {
	const activity = item?.system?.activities?.get(activityId);
	if ( activityConsumptionUsesActivityUses(activity) ) {
		const u = activity?.uses;
		if ( !u?.max ) return 0;
		const v = u.value;
		return Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
	}
	const uses = item?.system?.uses;
	if ( !uses ) return 0;
	const max = parseItemUsesMax(item);
	if ( max <= 0 ) return 0;
	const v = uses.value;
	return Number.isFinite(Number(v)) ? Math.max(0, Math.min(Number(v), max)) : 0;
}

/**
 * dnd5e 5.2 `consumeItemUses` / `consumeActivityUses` increment `*.uses.spent`, not `uses.value`.
 * @param {import("@league/foundry").documents.Item} item
 * @param {string} activityId
 */
async function consumeOneForceRecoveryUse(item, activityId) {
	const activity = item.system?.activities?.get(activityId);
	if ( activityConsumptionUsesActivityUses(activity) ) {
		const spent = Math.max(0, Number(activity?.uses?.spent) || 0);
		await item.update({ [`system.activities.${activityId}.uses.spent`]: spent + 1 });
		return;
	}
	const spent = Math.max(0, Number(item.system?.uses?.spent) || 0);
	await item.update({ "system.uses.spent": spent + 1 });
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 */
function getForcePointSnapshot(actor) {
	const points = actor?.system?.powercasting?.force?.points;
	if ( !points || typeof points !== "object" ) return null;
	const value = Number(points.value);
	const max = Number(points.max);
	const tempmax = Number(points.tempmax);
	const cur = Number.isFinite(value) ? value : 0;
	const maxPart = Number.isFinite(max) ? max : 0;
	const tempMaxPart = Number.isFinite(tempmax) ? tempmax : 0;
	const cap = Math.max(0, maxPart + tempMaxPart);
	return { cur, cap, raw: points };
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string} key
 */
function abilityMod(actor, key) {
	const m = actor?.system?.abilities?.[key]?.mod;
	return Number.isFinite(Number(m)) ? Number(m) : 0;
}

function localizeOr(key, fallback) {
	const s = game.i18n.localize(key);
	return s && s !== key ? s : fallback;
}

/**
 * @param {import("@league/foundry").documents.Item} item
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string} activityId
 */
function validateForceRecoveryUse(item, actor, activityId) {
	if ( !actor?.id ) {
		ui.notifications.warn(localizeOr("SW5E.ForceRecovery.WarnNoActor", "Cannot use Force Recovery: no character was found."));
		return false;
	}
	if ( !actor.isOwner && !game.user.isGM ) {
		ui.notifications.warn(localizeOr("SW5E.ForceRecovery.WarnNoPermission", "You don't have permission to use Force Recovery for this character."));
		return false;
	}
	if ( !actor.items?.has(item.id) ) {
		ui.notifications.warn(localizeOr("SW5E.ForceRecovery.WarnMissingItem", "This character does not have the Force Recovery feature."));
		return false;
	}
	if ( getConsularLevels(actor) < 1 ) {
		ui.notifications.warn(localizeOr("SW5E.ForceRecovery.WarnNoConsular", "Force Recovery requires at least 1 level in Consular."));
		return false;
	}
	const usesLeft = getForceRecoveryUsesRemaining(item, activityId);
	if ( usesLeft < 1 ) {
		ui.notifications.warn(localizeOr("SW5E.ForceRecovery.WarnNoUses", "Force Recovery has already been used. Complete a long rest before using it again."));
		return false;
	}
	const snap = getForcePointSnapshot(actor);
	if ( !snap || snap.cap <= 0 ) {
		ui.notifications.warn(localizeOr("SW5E.ForceRecovery.WarnNoPool", "No usable force point pool was found on this character."));
		return false;
	}
	if ( snap.cur >= snap.cap ) {
		ui.notifications.warn(localizeOr("SW5E.ForceRecovery.WarnPoolFull", "Force points are already full. Force Recovery was not used."));
		return false;
	}
	return true;
}

/**
 * @param {import("@league/foundry").documents.Activity} activity
 */
async function runForceRecoveryFlow(activity) {
	const activityId = activity?.id;
	const item = getRealEmbeddedItemFromActivity(activity);
	const actor = item?.parent;
	try {
		if ( !activityId || !item ) {
			ui.notifications.warn(localizeOr("SW5E.ForceRecovery.WarnMissingItem", "This character does not have the Force Recovery feature."));
			return;
		}
		if ( !validateForceRecoveryUse(item, actor, activityId) ) return;

		const consularLv = getConsularLevels(actor);
		const half = Math.floor(consularLv / 2);
		const wisMod = abilityMod(actor, "wis");
		const chaMod = abilityMod(actor, "cha");
		const wisTotal = Math.max(1, half + wisMod);
		const chaTotal = Math.max(1, half + chaMod);

		const snap0 = getForcePointSnapshot(actor);
		const wisLabel = CONFIG.DND5E?.abilities?.wis?.label ?? "Wisdom";
		const chaLabel = CONFIG.DND5E?.abilities?.cha?.label ?? "Charisma";

		const content = `
<div class="standard-form sw5e-force-recovery-dialog flexcol gap-sm">
	<p>${foundry.utils.escapeHTML(localizeOr("SW5E.ForceRecovery.DialogIntro", "Choose Wisdom or Charisma for this recovery. Each line shows how many force points that choice would restore (minimum 1). Use this after a short rest."))}</p>
	<ul class="plain">
		<li>${game.i18n.format("SW5E.ForceRecovery.DialogForcePoints", {
			current: snap0.cur,
			max: snap0.cap
		})}</li>
		<li>${game.i18n.format("SW5E.ForceRecovery.DialogConsularLevel", { level: consularLv })}</li>
		<li>${game.i18n.format("SW5E.ForceRecovery.DialogHalfLevel", { value: half })}</li>
		<li>${game.i18n.format("SW5E.ForceRecovery.DialogWisdomLine", {
			ability: wisLabel,
			mod: wisMod,
			total: wisTotal
		})}</li>
		<li>${game.i18n.format("SW5E.ForceRecovery.DialogCharismaLine", {
			ability: chaLabel,
			mod: chaMod,
			total: chaTotal
		})}</li>
	</ul>
</div>`;

		const choice = await DialogV2.wait({
			rejectClose: false,
			modal: true,
			window: { title: localizeOr("SW5E.ForceRecovery.Title", "Force Recovery") },
			position: { width: 420 },
			content,
			buttons: [
				{
					action: "wis",
					label: game.i18n.format("SW5E.ForceRecovery.ButtonWisdom", { total: wisTotal }),
					icon: "fas fa-eye",
					default: true
				},
				{
					action: "cha",
					label: game.i18n.format("SW5E.ForceRecovery.ButtonCharisma", { total: chaTotal }),
					icon: "fas fa-moon"
				},
				{
					action: "cancel",
					label: game.i18n.localize("Cancel"),
					icon: "fas fa-times"
				}
			]
		});

		if ( choice !== "wis" && choice !== "cha" ) return;

		if ( !validateForceRecoveryUse(item, actor, activityId) ) return;

		const amount = choice === "wis" ? wisTotal : chaTotal;
		const snap = getForcePointSnapshot(actor);
		if ( !snap || snap.cur >= snap.cap ) {
			ui.notifications.warn(localizeOr("SW5E.ForceRecovery.WarnPoolFull", "Force points are already full. Force Recovery was not used."));
			return;
		}

		const newVal = Math.min(snap.cap, snap.cur + amount);
		const gained = newVal - snap.cur;
		if ( gained <= 0 ) {
			ui.notifications.warn(localizeOr("SW5E.ForceRecovery.WarnNoGain", "No force points could be restored (your pool may already be full)."));
			return;
		}

		const abilityLabel = choice === "wis" ? wisLabel : chaLabel;

		await actor.update({ "system.powercasting.force.points.value": newVal });
		await consumeOneForceRecoveryUse(item, activityId);

		ui.notifications.info(game.i18n.format("SW5E.ForceRecovery.Success", {
			ability: abilityLabel,
			amount: gained,
			newTotal: newVal,
			max: snap.cap
		}));
	} catch ( err ) {
		console.error(`${getModuleId()} | Force Recovery`, err);
		ui.notifications.error(localizeOr("SW5E.ForceRecovery.ErrorUnexpected", "Force Recovery could not be completed. If this keeps happening, check the console (F12) for details."));
	}
}

export function patchForceRecovery() {
	Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
		if ( !isForceRecoveryUtilityActivity(activity) ) return true;
		void runForceRecoveryFlow(activity);
		return false;
	});
}
