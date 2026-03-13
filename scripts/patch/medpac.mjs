import { getFlag } from "../utils.mjs";

const MEDPAC_FLAG_PATH = "medpac";
const MEDPAC_BUTTON_SELECTOR = "[data-sw5e-medpac-roll]";
const MEDPAC_MESSAGE_CLASS = "sw5e-medpac-message";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

function normalizeDiceCount(value) {
	const count = Number(value);
	return Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
}

function parseHitDieFaces(hitDie) {
	const match = typeof hitDie === "string" ? /^d(\d+)$/i.exec(hitDie.trim()) : null;
	return match ? Number(match[1]) : null;
}

function parseHitDieFormula(formula) {
	const match = typeof formula === "string" ? /(?:^|[^\w])\d*d(\d+)(?:[^\w]|$)/i.exec(formula) : null;
	return match ? `d${match[1]}` : null;
}

function getMedpacConfig(subject) {
	const item = subject?.item ?? subject;
	if (!item || item.type !== "consumable") return null;

	const configured = getFlag(item, MEDPAC_FLAG_PATH);
	if (configured?.enabled) {
		return {
			enabled: true,
			diceCount: normalizeDiceCount(configured.diceCount),
			itemName: item.name,
			itemUuid: item.uuid
		};
	}

	if (item.system?.type?.subtype !== "medpac") return null;
	return {
		enabled: true,
		diceCount: 1,
		itemName: item.name,
		itemUuid: item.uuid
	};
}

function addMedpacMessageFlag(activity, messageConfig) {
	const medpac = getMedpacConfig(activity);
	if (!medpac) return;
	messageConfig.flags = foundry.utils.mergeObject(messageConfig.flags ?? {}, {
		sw5e: { medpac }
	}, { inplace: false });
}

function resolveClickActor() {
	const controlled = canvas?.tokens?.controlled
		?.map(token => token.actor)
		?.find(actor => actor?.isOwner);
	if (controlled) return controlled;

	const character = game.user?.character;
	return character?.isOwner ? character : null;
}

function collectClassHitDice(actor) {
	const tallies = new Map();
	for (const cls of actor?.itemTypes?.class ?? []) {
		const hitDie = cls?.system?.hitDice;
		const faces = parseHitDieFaces(hitDie);
		if (!faces) continue;
		const levels = Math.max(Number(cls?.system?.levels) || 0, 1);
		const current = tallies.get(hitDie) ?? { hitDie, faces, count: 0 };
		current.count += levels;
		tallies.set(hitDie, current);
	}
	return Array.from(tallies.values());
}

function getPredominantHitDie(actor) {
	const classHitDice = collectClassHitDice(actor);
	if (classHitDice.length) {
		classHitDice.sort((left, right) => {
			if (right.count !== left.count) return right.count - left.count;
			return right.faces - left.faces;
		});
		return classHitDice[0].hitDie;
	}

	return parseHitDieFormula(actor?.system?.attributes?.hp?.formula);
}

function createMedpacButton(medpac) {
	const controls = document.createElement("div");
	controls.className = "card-buttons";

	const button = document.createElement("button");
	button.type = "button";
	button.dataset.sw5eMedpacRoll = "true";
	button.textContent = `Roll ${medpac.itemName} Healing`;

	controls.append(button);
	return { controls, button };
}

async function rollMedpacHealing(message, button) {
	const medpac = getFlag(message, MEDPAC_FLAG_PATH);
	if (!medpac?.enabled) return;

	const actor = resolveClickActor();
	if (!actor) {
		ui.notifications.warn("Select a token you control or assign a character before rolling medpac healing.");
		return;
	}

	const hitDie = getPredominantHitDie(actor);
	if (!hitDie) {
		ui.notifications.warn(`${actor.name} does not have a detectable Hit Die size for medpac healing.`);
		return;
	}

	const diceCount = normalizeDiceCount(medpac.diceCount);
	const formula = `max(1, ${diceCount}${hitDie} + @abilities.con.mod)`;
	const rollData = actor.getRollData ? actor.getRollData() : actor.system;
	const roll = await new Roll(formula, rollData).evaluate({ async: true });
	const flavor = `${medpac.itemName} Healing (${diceCount}${hitDie} + CON)`;

	await roll.toMessage({
		flavor,
		speaker: ChatMessage.getSpeaker({ actor }),
		flags: {
			sw5e: {
				medpacResult: {
					actorId: actor.id,
					diceCount,
					hitDie,
					itemName: medpac.itemName,
					itemUuid: medpac.itemUuid
				}
			}
		}
	});

	button.blur();
}

function renderMedpacButton(message, html) {
	const medpac = getFlag(message, MEDPAC_FLAG_PATH);
	if (!medpac?.enabled) return;

	const root = getHtmlRoot(html);
	if (!root || root.querySelector(MEDPAC_BUTTON_SELECTOR)) return;

	const content = root.querySelector(".message-content") ?? root;
	const { controls, button } = createMedpacButton(medpac);
	button.addEventListener("click", async event => {
		event.preventDefault();
		button.disabled = true;
		try {
			await rollMedpacHealing(message, button);
		} finally {
			button.disabled = false;
		}
	});

	content.append(controls);
	root.classList.add(MEDPAC_MESSAGE_CLASS);
}

export function patchMedpac() {
	Hooks.on("dnd5e.preCreateUsageMessage", addMedpacMessageFlag);
	Hooks.on("renderChatMessageHTML", renderMedpacButton);
}
