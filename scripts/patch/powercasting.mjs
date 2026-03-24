import { getBestAbility } from "./../utils.mjs";
import { getModulePath, isModuleType } from "../module-support.mjs";
import { openPowerPointConfig } from "../power-point-config.mjs";

const PRECALCULATED_SPELLCASTING_KEY = "sw5e-preCalculatedSpellcastingClasses";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function formatSuperiorityPool(superiority) {
	const dice = superiority?.dice ?? {};
	const current = Number.isFinite(Number(dice.value)) ? Number(dice.value) : 0;
	const max = Number.isFinite(Number(dice.max)) ? Number(dice.max) : 0;
	const die = Number.isFinite(Number(superiority?.die)) ? Number(superiority.die) : 0;
	if ( !max || !die ) return null;
	return `${current}/${max}d${die}`;
}

function getPowercastingTypeFromItem(item) {
	return item?.system?.school === "tec" ? "tech" : "force";
}

function getPowerPointCost(item, activity, castLevel) {
	const powercastingType = getPowercastingTypeFromItem(item);
	const targetPath = `powercasting.${powercastingType}.points.value`;
	const activityTarget = activity?.consumption?.targets?.find(target =>
		target?.type === "attribute" && target?.target === targetPath
	);
	const baseCostValue = activityTarget?.value ?? item?.system?.consume?.amount ?? 0;
	const baseCost = Number.isFinite(Number(baseCostValue)) ? Number(baseCostValue) : 0;
	const itemLevel = Number.isFinite(Number(item?.system?.level)) ? Number(item.system.level) : 0;
	const selectedLevel = Number.isFinite(Number(castLevel)) ? Number(castLevel) : itemLevel;
	return baseCost + Math.max(0, selectedLevel - itemLevel);
}

function isSw5ePowerData(itemData) {
	if ( itemData?.type !== "spell" ) return false;
	const school = itemData?.system?.school;
	if ( school && Object.values(CONFIG.DND5E.powerCasting).some(castType => school in (castType?.schools ?? {})) ) return true;

	const consumeTarget = itemData?.system?.consume?.target;
	if ( typeof consumeTarget === "string" && /^powercasting\.(force|tech)\.points\.value$/.test(consumeTarget) ) return true;

	const activityTargets = Object.values(itemData?.system?.activities ?? {}).flatMap(activity => activity?.consumption?.targets ?? []);
	return activityTargets.some(target =>
		target?.type === "attribute" && /^powercasting\.(force|tech)\.points\.value$/.test(target?.target ?? "")
	);
}

function getDroppedPowerNormalizationUpdates(itemData) {
	if ( !isSw5ePowerData(itemData) ) return null;

	return {
		"system.method": "powerCasting",
		"system.prepared": true
	};
}

function normalizeDroppedPowerData(itemData) {
	const updates = getDroppedPowerNormalizationUpdates(itemData);
	if ( !updates ) return itemData;

	itemData.system ??= {};
	itemData.system.method = updates["system.method"];
	itemData.system.prepared = updates["system.prepared"];
	return itemData;
}

function normalizeRawDroppedPowerData(dropData) {
	if ( !dropData || (typeof dropData !== "object") ) return dropData;
	normalizeDroppedPowerData(dropData);
	if ( dropData.data && (typeof dropData.data === "object") ) normalizeDroppedPowerData(dropData.data);
	return dropData;
}

function getNumericValue(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function getLegacyPowerPoints(actor, castType) {
	const sourcePoints = actor?._source?.system?.attributes?.[castType]?.points;
	if ( sourcePoints && typeof sourcePoints === "object" ) return sourcePoints;
	const preparedPoints = actor?.system?.attributes?.[castType]?.points;
	if ( preparedPoints && typeof preparedPoints === "object" ) return preparedPoints;
	return actor?._source?.system?.[castType]?.points ?? actor?.system?.[castType]?.points ?? {};
}

function inferNpcPowerLevelFromPowers(actor, castType, typeConfig) {
	const schools = typeConfig?.schools ?? {};
	const powers = actor?.itemTypes?.spell ?? [];
	const relevantPowers = powers.filter(power => (power?.system?.school ?? "") in schools);
	if ( !relevantPowers.length ) return null;

	const highestPowerLevel = relevantPowers.reduce((highest, power) => {
		const level = getNumericValue(power?.system?.level) ?? 0;
		return Math.max(highest, level);
	}, 0);

	const fullProgression = typeConfig?.progression?.full?.powerMaxLevel;
	if ( !fullProgression || typeof fullProgression !== "object" ) {
		return highestPowerLevel > 0 ? Math.min(highestPowerLevel * 2, 20) : 1;
	}

	for (let lvl = 1; lvl <= 20; lvl += 1) {
		const cap = getNumericValue(fullProgression[lvl] ?? fullProgression[String(lvl)]) ?? 0;
		if ( cap >= highestPowerLevel ) return lvl;
	}
	return 20;
}

function getPowercastingMountPoint(root, actorType) {
	const hpButton = root.querySelector('[data-action="hitPoints"], [data-action="hit-points"]');
	const hpGroup = hpButton?.closest(".meter-group, .attrib.health, .attribute.health, .health, .resource");
	if ( hpGroup?.parentElement ) {
		return {
			container: hpGroup.parentElement,
			reference: hpGroup,
			insertAfter: true,
			append: false
		};
	}

	const hpSectionFromInput = root
		.querySelector('[name="system.attributes.hp.value"]')
		?.closest(".meter-group, .attrib.health, .attribute.health, .health, .resource");
	if ( hpSectionFromInput?.parentElement ) {
		return {
			container: hpSectionFromInput.parentElement,
			reference: hpSectionFromInput,
			insertAfter: true,
			append: false
		};
	}

	if ( root.classList?.contains("tidy5e-sheet") ) {
		const sidePanel = root.querySelector(".attributes .side-panel");
		if ( sidePanel ) {
			return {
				container: sidePanel,
				reference: null,
				insertAfter: false,
				append: false
			};
		}
	}

	if ( actorType === "npc" ) {
		const npcMount = [
			root.querySelector("header .attributes"),
			root.querySelector(".sheet-header .attributes")
		].find(Boolean);
		if ( npcMount?.parentElement ) {
			return {
				container: npcMount.parentElement,
				reference: npcMount,
				insertAfter: true,
				append: false
			};
		}
	}

	const sidebar = [
		root.querySelector(".sidebar .stats"),
		root.querySelector("[data-application-part='sidebar'] .stats"),
		root.querySelector(".sheet-sidebar .stats"),
		root.querySelector(".sidebar"),
		root.querySelector("[data-application-part='sidebar']"),
		root.querySelector(".sheet-sidebar")
	].find(Boolean);
	if ( sidebar ) {
		return {
			container: sidebar,
			reference: null,
			insertAfter: false,
			append: true
		};
	}

	const profileImage = root.querySelector("img.profile, .profile img, .portrait img, .profile-img");
	const profileBlock = profileImage?.closest("section, aside, header, div");
	if ( profileBlock?.parentElement ) {
		return {
			container: profileBlock.parentElement,
			reference: profileBlock,
			insertAfter: true,
			append: false
		};
	}

	return {
		container: root.querySelector("form, .window-content"),
		reference: null,
		insertAfter: false,
		append: true
	};
}

function reconcileNpcPowerPool(actor, castType, computedMax) {
	const sourcePoints = actor?._source?.system?.powercasting?.[castType]?.points ?? {};
	const legacyPoints = getLegacyPowerPoints(actor, castType);

	const sourceMax = getNumericValue(sourcePoints.max);
	const sourceValue = getNumericValue(sourcePoints.value);
	const legacyMax = getNumericValue(legacyPoints.max);
	const legacyValue = getNumericValue(legacyPoints.value);
	const computedPoolMax = Math.max(0, getNumericValue(computedMax) ?? 0);

	const effectiveMax = [sourceMax, legacyMax, computedPoolMax]
		.find(value => value != null && value > 0) ?? 0;

	let effectiveValue = effectiveMax;
	if ( sourceValue != null && sourceMax != null && sourceMax > 0 ) effectiveValue = sourceValue;
	else if ( legacyValue != null ) effectiveValue = legacyValue;
	else if ( sourceValue != null && effectiveMax === 0 ) effectiveValue = sourceValue;

	return {
		max: effectiveMax,
		value: Math.min(Math.max(getNumericValue(effectiveValue) ?? 0, 0), effectiveMax)
	};
}

// dataModels file adds:
// - powercasting field to CreatureTemplate
// - spellcasting.force/techProgression to ClassData and SubclassData

function adjustItemSpellcastingGetter() {
	Hooks.on('sw5e.Item5e.spellcasting', function (_this, result, config, ...args) {
		const spellcasting = _this.system.spellcasting;
		if (!spellcasting) return;
		const isSubclass = _this.type === "subclass";
		const classSC = isSubclass ? _this.class?.system?.spellcasting : spellcasting;
		const subclassSC = isSubclass ? spellcasting : _this.subclass?.system?.spellcasting;
		for (const castType of ["force", "tech"]) {
			const prop = castType + "Progression"
			delete result[prop];
			const classPC = classSC?.[prop] ?? "none";
			const subclassPC = subclassSC?.[prop] ?? "none";
			if (subclassPC !== "none") result[castType] = subclassPC;
			else result[castType] = classPC;
		}
	});
}

function normalizeDroppedPowerDefaults() {
	Hooks.on("sw5e.preItem5e.fromDropData", (_cls, data) => {
		normalizeRawDroppedPowerData(data);
	});

	Hooks.on("sw5e.Item5e.fromDropData", (_cls, result, config, ...args) => {
		if ( !result ) return;
		config.result = normalizeDroppedPowerData(result);
	});

	// The modern DnD5e drop pipeline no longer exposes a dedicated sheet _onDropSpell method.
	// Enforce the final method on actor-owned SW5E powers at creation time instead.
	Hooks.on("preCreateItem", (document, data) => {
		if ( document?.parent?.documentName !== "Actor" ) return;
		const updates = getDroppedPowerNormalizationUpdates(data);
		if ( !updates ) return;
		document.updateSource(updates);
	});
}

function preparePowercasting() {
	Hooks.on('sw5e.preActor5e._prepareSpellcasting', function (_this, result, config, ...args) {
		if (!_this.system.spells) return;
		const isNPC = _this.type === "npc";

		// Prepare base progression data
		const charProgression = ["force", "tech"].reduce((obj, castType) => {
			obj[castType] = {
				powersKnownCur: 0,
				powersKnownMax: 0,
				points: 0,
				casterLevel: 0,
				maxPowerLevel: 0,
				maxClassProg: null,
				maxClassLevel: 0,
				classes: 0,
				attributeOverride: null
			};
			return obj;
		}, {});

		for (const [castType, obj] of Object.entries(charProgression)) {
			const typeConfig = CONFIG.DND5E.powerCasting[castType];
			if (isNPC) {
				const levelKey = `power${castType.capitalize()}Level`;
				let level = getNumericValue(_this.system.details?.[levelKey]);
				const sourceLevel = getNumericValue(_this._source?.system?.details?.[levelKey]);
				if ( !(level > 0) ) level = sourceLevel;

				// Recovery path for already-imported NPCs whose legacy detail fields were pruned.
				if ( !(level > 0) ) {
					const inferredLevel = inferNpcPowerLevelFromPowers(_this, castType, typeConfig);
					if ( inferredLevel > 0 ) {
						level = inferredLevel;
						_this.system.details ??= {};
						_this.system.details[levelKey] = inferredLevel;
						if ( !(sourceLevel > 0) ) {
							_this.updateSource?.({ [`system.details.${levelKey}`]: inferredLevel });
						}
					}
				}

				if ( level > 0 ) {
					obj.classes = 1;
					obj.points = level * (typeConfig.progression.full?.powerPoints ?? 0);
					obj.casterLevel = level;
					obj.maxClassLevel = level;
					obj.maxClassProg = "full";
				}
			} else {
				// Translate the list of classes into power-casting progression
				for (const cls of _this.itemTypes?.class ?? []) {
					const pc = cls.spellcasting;

					if (!pc || pc.levels < 1) continue;
					const progression = pc[castType];

					if (!(progression in typeConfig.progression) || progression === "none") continue;
					if (progression === "half" && castType === "tech" && pc.levels < 2) continue; // Tech half-casters only get techcasting at lvl 2

					const progConfig = typeConfig.progression[progression];

					obj.classes++;
					obj.powersKnownMax += progConfig.powersKnown[pc.levels];
					obj.points += pc.levels * progConfig.powerPoints;
					obj.casterLevel += pc.levels * progConfig.powerMaxLevel[20] / 9;
					obj.maxPowerLevel = Math.max(obj.maxPowerLevel, progConfig.powerMaxLevel[20]);

					if (pc.levels > obj.maxClassLevel) {
						obj.maxClassLevel = pc.levels;
						obj.maxClassProg = progression;
					}
				}

				// Calculate known powers
				for (const pwr of _this.itemTypes?.spell ?? []) {
					const { properties, school } = pwr?.system ?? {};
					if (properties?.has("freeLearn")) continue;
					if (school in CONFIG.DND5E.powerCasting[castType].schools) obj.powersKnownCur++;
				}
			}
		}


		// Apply progression data
		for (const [castType, obj] of Object.entries(charProgression)) {
			const typeConfig = CONFIG.DND5E.powerCasting[castType] ?? {};
			const progConfig = typeConfig.progression[obj.maxClassProg] ?? {};

			// 'Round Appropriately'
			obj.points = Math.round(obj.points);
			obj.casterLevel = Math.round(obj.casterLevel);

			// What level is considered 'high level casting'
			obj.limit = progConfig.powerLimit ?? 0;

			// What is the maximum power level you can cast
			if (obj.classes) {
				if (obj.classes === 1) {
					obj.maxPowerLevel = progConfig.powerMaxLevel[obj.maxClassLevel];
				} else {
					// Don't allow multiclassing to achieve a higher max power level than a 20th level character of any of those classes
					obj.maxPowerLevel = Math.min(obj.maxPowerLevel, typeConfig.progression.full[obj.casterLevel]);
				}
			}

			// Apply the calculated values to the sheet
			const target = _this.system.powercasting[castType];
			target.known.value = obj.powersKnownCur;
			if ( isNPC ) {
				const reconciledPool = reconcileNpcPowerPool(_this, castType, obj.points);
				target.known.max = obj.powersKnownMax;
				target.level = obj.casterLevel;
				target.limit = obj.limit;
				target.maxPowerLevel = obj.maxPowerLevel;
				target.points.max = reconciledPool.max;
				target.points.value = reconciledPool.value;
				const legacyPoints = _this.system.attributes?.[castType]?.points;
				if ( legacyPoints && typeof legacyPoints === "object" ) {
					legacyPoints.max = reconciledPool.max;
					legacyPoints.value = reconciledPool.value;
				}
			} else {
				target.known.max ??= obj.powersKnownMax;
				target.level ??= obj.casterLevel;
				target.limit ??= obj.limit;
				target.maxPowerLevel ??= obj.maxPowerLevel;
				target.points.max ??= obj.points;
			}
		}

		const { simplifyBonus } = dnd5e.utils;
		const rollData = _this.getRollData();

		const { attributes, powercasting } = _this.system;
		const base = 8 + (attributes.prof ?? 0);
		const lvl = Number(_this.system.details?.level ?? _this.system.details.cr ?? 0);

		// TODO: Add rules
		// // Simplified forcecasting rule
		// if (game.settings.get("sw5e", "simplifiedForcecasting")) {
		// 	CONFIG.DND5E.powerCasting.force.schools.lgt.attr = CONFIG.DND5E.powerCasting.force.schools.uni.attr;
		// 	CONFIG.DND5E.powerCasting.force.schools.drk.attr = CONFIG.DND5E.powerCasting.force.schools.uni.attr;
		// }

		// Powercasting DC for Actors and NPCs
		const ability = {};
		const bonusAll = simplifyBonus(_this.system.bonuses?.power?.dc?.all, rollData);
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			for (const [school, schoolConfig] of Object.entries(typeConfig.schools)) {
				const schoolData = powercasting[castType].schools[school];
				const bonus = simplifyBonus(_this.system.bonuses?.power?.dc?.[school], rollData) + bonusAll;
				ability[school] = getBestAbility(_this, schoolConfig.attr, 0);
				if (ability[school].mod > (ability[castType]?.mod ?? -Infinity)) ability[castType] = ability[school];
				schoolData.attr = ability[school]?.id ?? "";
				schoolData.dc = base + ability[school].mod + bonus;
			}
		}

		// Set Force and tech bonus points for PC Actors
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const cast = _this.system.powercasting[castType];
			const castSource = _this._source?.system?.powercasting?.[castType];

			if (!castSource || castSource.points?.max !== null) continue;
			if (cast.level === 0) continue;

			if (ability[castType]?.mod) cast.points.max += ability[castType].mod;

			const levelBonus = simplifyBonus(cast.points.bonuses.level ?? 0, rollData) * lvl;
			const overallBonus = simplifyBonus(cast.points.bonuses.overall ?? 0, rollData);
			const focus = _this.focuses?.[CONFIG.DND5E.powerCasting[castType].focus.label];
			const focusProperty = CONFIG.DND5E.powerCasting[castType].focus.property;
			const focusBonus = focus?.flags?.sw5e?.properties?.[focusProperty] ?? 0;

			cast.points.max += levelBonus + overallBonus + focusBonus;
		}
	});
}

function makeProgOption(config) {
	const option = document.createElement("option");
	option.setAttribute("value", config.value);
	if (config.selected) option.setAttribute("selected", null);
	const text = document.createTextNode(game.i18n.localize(config.label));
	option.appendChild(text);
	return option;
}

function showPowercastingStats() {
	Hooks.on("renderBaseActorSheet", function (app, html, context, options) {
		const root = getHtmlRoot(html);
		if ( !root || !context?.actor ) return;
		const actorItems = context.actor.toObject().items;
		const actorAbilities = context.actor.system.abilities;
		const superiorityData = context.actor.system.superiority;
		const superiorityPool = formatSuperiorityPool(superiorityData);
		const powercastingCardsSection = root.querySelector(`section.tab[data-tab="spells"] section.top`);
		if ( !powercastingCardsSection ) return;
		const dndSpellcastingCards = powercastingCardsSection.querySelectorAll("div.spellcasting.card:not(.sw5e)");
		dndSpellcastingCards.forEach(card => card.remove());

		// Powercasting Cards (Name + Ability Used)
		const forcecastingCards = [
			{ name: "Forcecasting (Light)", getAbility: () => "wis" },
			{ name: "Forcecasting (Dark)", getAbility: () => "cha" },
			{ name: "Forcecasting (Neutral)", getAbility: () => {
				if (actorAbilities.wis.value > actorAbilities.cha.value) return "wis";
				else return "cha";
			}},
		];
		const superiorityCards = [
			{ name: "Superiority (Mental)", getAbility: () => {
				const mentalAbilities = ["int", "wis", "cha"];
				const greater = {name: mentalAbilities[0], value: actorAbilities[mentalAbilities[0]].value};
				for (let i=1; i<mentalAbilities.length; i++) {
					const ability = mentalAbilities[i];
					if (actorAbilities[ability].value > greater.value) {
						greater.name = ability;
						greater.value = actorAbilities[ability].value;
					}
				}
				return greater.name;
			}, getResource: () => superiorityPool},
			{ name: "Superiority (Physical)", getAbility: () => {
				const physicalAbilities = ["str", "dex", "con"];
				const greater = {name: physicalAbilities[0], value: actorAbilities[physicalAbilities[0]].value};
				for (let i=1; i<physicalAbilities.length; i++) {
					const ability = physicalAbilities[i];
					if (actorAbilities[ability].value > greater.value) {
						greater.name = ability;
						greater.value = actorAbilities[ability].value;
					}
				}
				return greater.name;
			}, getResource: () => superiorityPool},
			{ name: "Superiority (General)", getAbility: () => {
				const allAbilities = ["str", "dex", "con", "int", "wis", "cha"];
				const greater = {name: allAbilities[0], value: actorAbilities[allAbilities[0]].value};
				for (let i=1; i<allAbilities.length; i++) {
					const ability = allAbilities[i];
					if (actorAbilities[ability].value > greater.value) {
						greater.name = ability;
						greater.value = actorAbilities[ability].value;
					}
				}
				return greater.name;
			}, getResource: () => superiorityPool},
		];
		const techcastingCard = { name: "Techcasting", getAbility: () => "int" };

		const actorPowers = actorItems.filter(item => item.type === "spell");
		const actorClasses = actorItems.filter(item => item.type === "class");
		const actorManeuvers = actorItems.filter(item => isModuleType(item.type, "maneuver"));

		// Verification
		const hasSuperiority = (
			actorClasses.some(clss => clss.system?.spellcasting?.superiorityProgression && (clss.system.spellcasting.superiorityProgression !== "none"))
			|| actorManeuvers.length > 0
			|| (superiorityData?.level > 0)
		);
		const hasForcecasting = (
			actorClasses.some(clss => ["consular", "guardian", "sentinel"].includes(clss.system.identifier))
			||
			actorPowers.some(power => ["lgt", "drk", "uni"].includes(power.system.school))
		);
		const hasTechcasting = (
			actorClasses.some(clss => ["engineer", "scout"].includes(clss.system.identifier))
			||
			actorPowers.some(power => power.system.school === "tec")
		);

		// Rendering
		const powercastingCardsToRenderize = [];
		if (hasSuperiority) powercastingCardsToRenderize.push(...superiorityCards);
		if (hasForcecasting) powercastingCardsToRenderize.push(...forcecastingCards);
		if (hasTechcasting) powercastingCardsToRenderize.push(techcastingCard);

		powercastingCardsToRenderize.forEach(powercasting => {
			const powercastingCard = document.createElement("div");
			powercastingCard.classList.add("spellcasting", "card", "sw5e");
			const ability = powercasting.getAbility();
			const resource = powercasting.getResource?.();
			powercastingCard.dataset.ability = ability;
			const powercastingAttackWithSymbol = actorAbilities[ability].attack >= 0 ? `+${actorAbilities[ability].attack}` : actorAbilities[ability].attack;
			powercastingCard.innerHTML = `
				<div class="header">
					<h3>${powercasting.name}</h3>
				</div>
				<div class="info">
					${resource ? `
					<div class="resource">
						<span class="label">${game.i18n.localize("SW5E.Superiority.Dice.Label")}</span>
						<span class="value">${resource}</span>
					</div>` : ""}
					<div class="ability">
						<span class="label">Ability</span>
						<span class="value">${ability.toUpperCase()}</span>
					</div>
					<div class="attack">
						<span class="label">Attack</span>
						<span class="value">${powercastingAttackWithSymbol}</span>
					</div>
					<div class="save">
						<span class="label">Save</span>
						<span class="value">${actorAbilities[ability].dc}</span>
					</div>
				</div>
			`;
			powercastingCardsSection.appendChild(powercastingCard);
		});
	});

	/* // Old One:
	const { simplifyBonus } = dnd5e.utils;
	Hooks.on('sw5e.ActorSheet5eCharacter.getData', function (_this, context, config, ...args) {
		const msak = simplifyBonus(_this.actor.system.bonuses.msak.attack, context.rollData);
		const rsak = simplifyBonus(_this.actor.system.bonuses.rsak.attack, context.rollData);
		for (const castType of ["tech", "force"]) {
			const castData = _this.actor.system.powercasting[castType];
			if (castData.level === 0) continue;
			const sc = castData.schools.tec ?? castData.schools.uni ?? {};
			const ability = _this.actor.system.abilities[sc.attr];
			const mod = ability?.mod ?? 0;
			const attackBonus = msak === rsak ? msak : 0;
			context.spellcasting?.push({
				label: game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Label`) + ` (${castData.points.value}/${castData.points.max})`,
				ability: { mod: ability?.mod ?? 0, ability: sc.attr ?? "" },
				attack: mod + _this.actor.system.attributes.prof + attackBonus,
				primary: _this.actor.system.attributes.spellcasting === sc.attr,
				save: ability?.dc ?? 0
			});
		}
	});
	*/
}

function patchItemSheet() {
	Hooks.on("renderItemSheet5e", (app, html, data) => {
		const root = getHtmlRoot(html);
		if ( !root || !app.item?.system?.spellcasting ) return;
		root.querySelectorAll(`select[name|='system.spellcasting.progression']`).forEach((el, idx) => {
			const root = el.parentNode.parentNode;
			if ( !root?.nextElementSibling ) return;
			for (const castType of ["Tech", "Force"]) {
				const selectedValue = app.item.system.spellcasting[`${castType.toLowerCase()}Progression`];
				const div = document.createElement("div");
				div.setAttribute("class", "form-group");
				const label = document.createElement("label");
				const text = document.createTextNode(game.i18n.localize(`SW5E.Powercasting.${castType}.Prog.Label`));
				label.appendChild(text);
				div.appendChild(label);
				const div2 = document.createElement("div");
				div2.setAttribute("class", "form-fields");
				const select = document.createElement("select");
				select.setAttribute("name", `system.spellcasting.${castType.toLowerCase()}Progression`);
				select.appendChild(makeProgOption({
					value: "none",
					selected: selectedValue === "none",
					label: "DND5E.None"
				}));
				if (!app.isEditable) select.setAttribute("disabled", null);
				for (const [key, prog] of Object.entries(CONFIG.DND5E.powerCasting[castType.toLowerCase()].progression)) {
					select.appendChild(makeProgOption({
						value: key,
						selected: selectedValue === key,
						label: prog.label
					}));
				}
				div2.appendChild(select);
				div.appendChild(div2);
				root.nextElementSibling.insertAdjacentElement("afterend", div);
			}
		});
	});
}

function patchPowerAbilityScore() {
	Hooks.on('sw5e.preActor5e.spellcastingClasses', function (_this, ...args) {
		_this[PRECALCULATED_SPELLCASTING_KEY] = _this._spellcastingClasses !== undefined;
	});
	Hooks.on('sw5e.Actor5e.spellcastingClasses', function (_this, result, config, ...args) {
		const preCalculated = _this[PRECALCULATED_SPELLCASTING_KEY];
		delete _this[PRECALCULATED_SPELLCASTING_KEY];

		if (preCalculated) return;
		for (const [identifier, cls] of Object.entries(_this.classes)) for (const castType of ["force", "tech"]) {
			if (cls.spellcasting && (cls.spellcasting[`${castType}Progression`] !== "none")) result[identifier] = cls;
		}
	});

	Hooks.on('sw5e.SpellData.getSheetData', function (_this, result, config, ...args) {
		const context = args[0];
		if (_this.parent.actor) {
			for (const [castType, castData] of Object.entries(_this.parent.actor.system?.powercasting ?? {})) {
				if (_this.school in castData.schools) {
					const abl = castData.schools[_this.school].attr;
					const ability = CONFIG.DND5E.abilities[abl]?.label?.toLowerCase();
					if (ability) context.defaultAbility = game.i18n.format("DND5E.DefaultSpecific", { default: ability });
				}
			}
		}
	});
	Hooks.on('sw5e.SpellData.availableAbilities', function (_this, result, config, ...args) {
		if (_this.ability) return;
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			if (_this.school in typeConfig.schools) {
				const attrs = typeConfig.schools[_this.school].attr;
				config.result = new Set(Array.isArray(attrs) ? attrs : [attrs]);
				return;
			}
		}
	});
	Hooks.on('sw5e.SpellData._typeAbilityMod', function (_this, result, config, ...args) {
		const availableAbilities = Array.from(_this.availableAbilities ?? []);
		config.result = getBestAbility(_this.parent.actor, availableAbilities).id ?? availableAbilities[0] ?? "int";
	});
}

function patchPowerbooks() {
	Hooks.on('sw5e.ActorSheet5e._prepareSpellbook', function (_this, powerbook, config, ...args) {
		const spellbook = config.result ?? powerbook ?? {};
		const columns = Object.values(spellbook)[0]?.columns ?? [];
		const reassignedPowers = [];
		const maxOrder = Object.values(spellbook).reduce((highest, section) => Math.max(highest, section?.order ?? 0), 0);
		const powerOrderBase = maxOrder + 1;

		const registerSection = (key, order, label, dataset) => {
			if ( key in spellbook ) return spellbook[key];
			const section = spellbook[key] = {
				label: game.i18n.localize(label),
				columns,
				order,
				usesSlots: false,
				id: key,
				slot: key,
				items: [],
				minWidth: 220,
				draggable: true,
				dataset: { type: "spell", method: "powerCasting", ...dataset }
			};
			return section;
		};

		for (const [key, section] of Object.entries(spellbook)) {
			if ( !Array.isArray(section?.items) ) continue;
			section.items = section.items.filter(item => {
				if ( item?.type !== "spell" || item?.system?.method !== "powerCasting" ) return true;
				reassignedPowers.push(item);
				return false;
			});

			if ( section.items.length === 0 && ((section?.dataset?.method === "powerCasting") || (key === "powerCasting")) ) {
				delete spellbook[key];
			}
		}

		for (const power of reassignedPowers) {
			const level = getNumericValue(power?.system?.level) ?? 0;
			const sectionKey = level <= 0 ? "powercasting-atwill" : `powercasting-level-${level}`;
			const label = level <= 0 ? "DND5E.SpellLevel0" : `DND5E.SpellLevel${level}`;
			const sectionOrder = powerOrderBase + Math.max(level, 0);
			const section = registerSection(sectionKey, sectionOrder, label, { level: String(Math.max(level, 0)) });
			section.items.push(power);
		}

		config.result = Object.fromEntries(
			Object.entries(spellbook).sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
		);
	});
}

function patchAbilityUseDialog() {
	Hooks.on('sw5e.ActivityUsageDialog._prepareScalingContext', function (_this, result, config, ...args) {
		const context = config.result;

		if (_this.activity.requiresSpellSlot && (_this.config.scaling !== false) && (_this.item.system.method === "powerCasting")) {
			if (context.notes.length >= 1) {
				const note = context.notes[context.notes.length - 1];
				if (note.type === "warn" && note.message.startsWith("You have no available")) context.notes.pop();
			}
			const powercastingType = getPowercastingTypeFromItem(_this.item);
			const powercasting = _this.actor.system.powercasting[powercastingType];
			if ( !powercasting ) return;

			const minimumLevel = getNumericValue(_this.item.system.level) ?? 1;
			const maximumLevel = getNumericValue(powercasting.maxPowerLevel) ?? 0;
			const currentPoints = Number.isFinite(Number(powercasting.points?.value)) ? Number(powercasting.points.value) : 0;
			const limit = Number.isFinite(Number(powercasting.limit)) ? Number(powercasting.limit) : 0;
			if ( maximumLevel < minimumLevel ) {
				context.notes.push({
					type: "warn",
					message: game.i18n.format("SW5E.Powercasting.NoLevelsAvailable", {
						name: _this.item.name
					})
				});
				return;
			}

			const spellSlotOptions = Array.from({ length: maximumLevel - minimumLevel + 1 }, (v, i) => {
				const lvl = i + minimumLevel;
				const label = game.i18n.localize(`DND5E.SpellLevel${lvl}`);
				const cost = getPowerPointCost(_this.item, _this.activity, lvl);
				const alreadyUsed = limit > 0 && lvl >= limit && powercasting.used.has(lvl);
				return {
					value: lvl,
					label,
					cost,
					affordable: cost <= currentPoints,
					disabled: alreadyUsed || (cost > currentPoints)
				};
			});

			if (spellSlotOptions) context.spellSlots = {
				field: new foundry.data.fields.StringField({ label: game.i18n.localize("DND5E.SpellCastUpcast") }),
				name: "spell.slot",
				value: _this.config.spell?.slot,
				options: spellSlotOptions
			};

			if (!spellSlotOptions.some(o => !o.disabled)) {
				const messageKey = spellSlotOptions.some(o => o.affordable)
					? "SW5E.Powercasting.NoLevelsAvailable"
					: "SW5E.Powercasting.NoPoints";
				const pointNamespace = powercastingType === "tech" ? "Tech" : "Force";
				context.notes.push({
					type: "warn",
					message: game.i18n.format(messageKey, {
						name: _this.item.name,
						resource: game.i18n.localize(`SW5E.Powercasting.${pointNamespace}.Point.Label`)
					})
				});
			}
		}
	});
	Hooks.on('sw5e.ActivityUsageDialog._prepareSubmitData', function (_this, result, config, ...args) {
		if (_this.item.system.method !== "powerCasting") return;

		const submitData = result;
		if (foundry.utils.hasProperty(submitData, "spell.slot")) {
			const level = submitData.spell.slot ?? 0;
			const scaling = Math.max(0, level - _this.item.system.level);
			submitData.scaling = scaling;
		}
	});
	Hooks.on('dnd5e.activityConsumption', function (activity, usageConfig, messageConfig, updates) {
		if (activity?.item?.type !== "spell" || activity?.item?.system?.method !== "powerCasting") return;
		const powercastingType = getPowercastingTypeFromItem(activity.item);
		const powercasting = activity?.actor?.system?.powercasting?.[powercastingType];
		if ( !powercasting ) return;
		const level = usageConfig?.spell?.slot ?? 0;
		if (level >= powercasting.limit) {
			powercasting.used.add(level);
			updates.actor[`system.powercasting.${powercastingType}.used`] = powercasting.used;
		}
	});
}

function recoverPowerPoints() {
	Hooks.on("dnd5e.shortRest", (actor, config) => {
		for (const [castType, castConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const points = actor.system.powercasting[castType].points;
			if (!castConfig.shortRest) continue;
			if (points.value === points.max) continue;
			actor.update({ [`system.powercasting.${castType}.points.value`]: points.max });
		}
	});
	Hooks.on("dnd5e.longRest", (actor, config) => {
		for (const [castType, castConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const { value, max } = actor.system.powercasting[castType].points;
			if (value === max) continue;
			actor.update({ [`system.powercasting.${castType}.points.value`]: max });
		}
	});
}

function makePowerPointsConsumable() {
	Hooks.once("setup", function () {
		for (const castType of ["force", "tech"]) {
			CONFIG.DND5E.consumableResources.push(`powercasting.${castType}.points.value`);
		}
	});
}

function showPowercastingBar() {
	const { simplifyBonus } = dnd5e.utils;
	Hooks.on("renderActorSheetV2", async (app, html, data) => {
		const root = getHtmlRoot(html);
		if ( !root ) return;
		if (data.actor.type != "character" && data.actor.type != "npc") {
			return;
		}
		root.querySelectorAll(".sw5e-powercasting-meter").forEach(node => node.remove());

		const powerCasting = data.actor.system.powercasting;
		const mountPoint = getPowercastingMountPoint(root, data.actor.type);
		const mountContainer = mountPoint.container;
		if ( !mountContainer ) return;
		let insertReference = mountPoint.reference;

		// Add meters for the tech and force powercasting values. This 
		// will be added right after the hit points meter.
		for (const castType of ["force", "tech"]) {
			const castData = powerCasting[castType];
			const value = Number.isFinite(Number(castData?.points?.value)) ? Number(castData.points.value) : 0;
			const temp = Number.isFinite(Number(castData?.points?.temp)) ? Number(castData.points.temp) : 0;
			const max = Number.isFinite(Number(castData?.points?.max)) ? Number(castData.points.max) : 0;
			const tempmax = Number.isFinite(Number(castData?.points?.tempmax)) ? Number(castData.points.tempmax) : 0;
			const effectiveMax = Math.max(0, max + tempmax);
			const clampedValue = Math.max(0, Math.min(value, effectiveMax || value));
			const shouldRenderMeter = (Number(castData?.level ?? 0) > 0) || (max > 0) || (value > 0) || (temp > 0) || (tempmax !== 0);
			if ( shouldRenderMeter ) {
				const templateData = {
					'castType': castType,
					'pointsLabel': game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Point.Label`),
					'configureLabel': `${game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Point.Label`)} Configuration`,
					'isEditable': app.editable,
					'value': value,
					'ariaMax': effectiveMax,
					'tempmax': tempmax,
					'tempmaxSign': (tempmax > 0) ? 'temp-positive' : (tempmax < 0) ? 'temp-negative' : '',
					'effectiveMax': effectiveMax,
					'pct': effectiveMax > 0 ? (clampedValue / effectiveMax) * 100 : 0,
					'bonus': game.dnd5e.utils.formatNumber(tempmax, { signDisplay: "always" })
				};

				let container = $('<div class="meter-group sw5e-powercasting-meter"></div>');

				const templateFile = getModulePath("templates/powercasting-sheet-tracker.hbs");
				const renderedHtml = await foundry.applications.handlebars.renderTemplate(templateFile, templateData);

				container.append(renderedHtml);
				const containerElement = container[0];
				if ( mountPoint.insertAfter && insertReference?.parentElement ) {
					insertReference.insertAdjacentElement("afterend", containerElement);
					insertReference = containerElement;
				} else if ( mountPoint.append ) {
					mountContainer.append(containerElement);
				} else {
					mountContainer.prepend(containerElement);
				}
				if (app.isEditable) {
					const pointBar = containerElement.querySelector(`.progress.${castType}-points`);
					const configButton = containerElement.querySelector('[data-action="configure-power-points"]');
					const currentInput = pointBar?.querySelector('input[name$=".points.value"]');
					pointBar?.addEventListener("click", event => _toggleEditPoints(castType, event, true));
					currentInput?.addEventListener("blur", event => _toggleEditPoints(castType, event, false));
					currentInput?.addEventListener("focus", ev => ev.currentTarget.select());
					currentInput?.addEventListener("change", app._onChangeInputDelta.bind(app));
					configButton?.addEventListener("click", event => {
						event.preventDefault();
						event.stopPropagation();
						openPowerPointConfig(data.actor, castType);
					});
				}
			}
		}
	});
}

/**
 * Toggle editing points bar.
 * @param {string} pointType    The type of points.
 * @param {PointerEvent} event  The triggering event.
 * @param {boolean} edit        Whether to toggle to the edit state.
 * @protected
 */
function _toggleEditPoints(pointType, event, edit) {
	const target = event.currentTarget.closest(`.${pointType}-points`);
	if ( !target ) return;
	const label = target.querySelector(":scope > .label");
	const input = target.querySelector(":scope > input");
	if ( !label || !input ) return;
	target.classList.toggle("editing", edit);
	label.hidden = edit;
	input.hidden = !edit;
	if ( edit ) input.focus();
}

export function patchPowercasting() {
	adjustItemSpellcastingGetter();
	normalizeDroppedPowerDefaults();
	patchItemSheet();
	patchPowerAbilityScore();
	patchPowerbooks();
	patchAbilityUseDialog();
	preparePowercasting();
	recoverPowerPoints();
	showPowercastingStats();
	makePowerPointsConsumable();
	showPowercastingBar();
}
