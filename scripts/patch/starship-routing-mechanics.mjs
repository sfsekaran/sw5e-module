import { getModuleId, HOOKS_NAMESPACE } from "../module-support.mjs";
import {
	getPowerRoutingMultiplier,
	getShieldDamageMultiplier,
	getShieldRegenMultiplier,
	getShieldState,
	isStarshipWeapon,
	isSw5eStarshipActor,
	syncShieldUpdateChange
} from "../starship-routing.mjs";

function scaleDamageFormula(formula, multiplier) {
	if ( multiplier === 2 ) return `(${formula}) * 2`;
	if ( multiplier === 0.5 ) return `floor((${formula}) / 2)`;
	return formula;
}

function makeScaledDamageRoll(roll, multiplier, optionKey="sw5eRoutingAdjusted") {
	if ( !roll || (multiplier === 1) || roll.options?.[optionKey] ) return roll;
	return new CONFIG.Dice.DamageRoll(
		scaleDamageFormula(roll.formula, multiplier),
		roll.data,
		{
			...(roll.options ?? {}),
			[optionKey]: true
		}
	);
}

function getShieldApplicationType(item, rolls=[]) {
	if ( !isSw5eStarshipActor(item?.actor) || (item?.system?.actionType !== "heal") ) return null;
	const hasShieldFormula = rolls.some(roll => String(roll?.formula ?? "").toLowerCase().includes("@attributes.shld"));
	if ( !hasShieldFormula ) return null;
	if ( rolls.some(roll => roll?.options?.type === "healing") ) return "regenerate";
	return null;
}

function setMessageShieldApplication(message, shieldApplication) {
	if ( !message || !shieldApplication ) return;
	message.data ??= {};
	foundry.utils.setProperty(message.data, `flags.${getModuleId()}.shieldApplication`, shieldApplication);
}

function getMessageShieldApplication(message) {
	const moduleId = getModuleId();
	return message?.getFlag?.(moduleId, "shieldApplication")
		?? message?.flags?.[moduleId]?.shieldApplication
		?? foundry.utils.getProperty(message?.data, `flags.${moduleId}.shieldApplication`)
		?? null;
}

function applyShieldDamage(actor, amount, updates) {
	const shields = getShieldState(actor);
	if ( amount <= 0 || shields.value <= 0 ) return false;

	const multiplier = getShieldDamageMultiplier(actor);
	if ( multiplier === 1 ) return false;

	const adjustedAmount = Math.max(0, Math.floor(amount * multiplier));
	const hull = actor.system?.attributes?.hp ?? {};
	const currentHull = Number(hull.value) || 0;
	const absorbed = Math.min(shields.value, adjustedAmount);
	const hullDamage = Math.max(0, Math.min(adjustedAmount - absorbed, currentHull));

	updates["system.attributes.hp.temp"] = Math.max(shields.value - absorbed, 0);
	updates["system.attributes.hp.value"] = Math.max(currentHull - hullDamage, 0);
	return true;
}

function applyShieldRegeneration(actor, amount, updates) {
	if ( amount >= 0 ) return false;

	const shields = getShieldState(actor);
	if ( shields.max <= 0 ) return false;

	const multiplier = getShieldRegenMultiplier(actor);
	const recovered = Math.max(0, Math.floor(Math.abs(amount) * multiplier));
	const nextShieldValue = Math.min(shields.max, shields.value + recovered);
	const currentHull = Number(actor.system?.attributes?.hp?.value) || 0;

	updates["system.attributes.hp.temp"] = nextShieldValue;
	updates["system.attributes.hp.value"] = currentHull;
	return true;
}

export function patchStarshipRoutingMechanics() {
	Hooks.on("preUpdateActor", (actor, changed) => {
		syncShieldUpdateChange(actor, changed);
	});

	Hooks.on("dnd5e.preApplyDamage", (actor, amount, updates, options) => {
		if ( !isSw5eStarshipActor(actor) ) return;

		if ( options?.sw5eShieldApplication === "regenerate" ) {
			applyShieldRegeneration(actor, amount, updates);
			return;
		}

		applyShieldDamage(actor, amount, updates);
	});

	Hooks.on("dnd5e.postDamageRollConfiguration", (rolls, config, dialog, message) => {
		const item = config?.subject?.item;
		const notes = [];

		if ( isStarshipWeapon(item) ) {
			const multiplier = getPowerRoutingMultiplier(item.actor, "weapons");
			if ( multiplier !== 1 ) {
				for ( let i = 0; i < rolls.length; i += 1 ) {
					rolls[i] = makeScaledDamageRoll(rolls[i], multiplier);
				}

				notes.push(multiplier > 1 ? "Weapons routed: damage doubled" : "Weapons routed: damage halved");
			}
		}

		const shieldApplication = getShieldApplicationType(item, rolls);
		if ( shieldApplication === "regenerate" ) {
			const multiplier = getShieldRegenMultiplier(item.actor);
			if ( multiplier !== 1 ) {
				for ( let i = 0; i < rolls.length; i += 1 ) {
					const isShieldHealingRoll = String(rolls[i]?.formula ?? "").toLowerCase().includes("@attributes.shld")
						&& (rolls[i]?.options?.type === "healing");
					if ( isShieldHealingRoll ) {
						rolls[i] = makeScaledDamageRoll(rolls[i], multiplier, "sw5eShieldRoutingAdjusted");
					}
				}

				notes.push(multiplier > 1 ? "Shields routed: regeneration doubled" : "Shields routed: regeneration halved");
			}

			setMessageShieldApplication(message, shieldApplication);
		}

		if ( notes.length ) {
			message.data ??= {};
			const modifierText = notes.join("; ");
			message.data.flavor = message.data.flavor ? `${message.data.flavor} (${modifierText})` : modifierText;
		}
	});

	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.components.DamageApplicationElement.prototype.getTargetOptions", function(wrapped, ...args) {
			const options = wrapped(...args);
			const shieldApplication = getMessageShieldApplication(this.chatMessage);
			if ( shieldApplication && !options.sw5eShieldApplication ) options.sw5eShieldApplication = shieldApplication;
			return options;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn(`${HOOKS_NAMESPACE.toUpperCase()} | Skipping incompatible damage application wrapper target.`, err);
	}
}
