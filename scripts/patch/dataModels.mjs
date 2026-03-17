import * as dataModels from "./../data/_module.mjs";
import { ItemSheetSW5E } from "./../applications/item-sheet.mjs";
import { getModule, getModuleId, getModuleTypeCandidates } from "../module-support.mjs";
import { buildStarshipRuntime, buildStarshipSkillEntries, getStarshipTier, isStarshipCharacterActor } from "../starship-character.mjs";

const { BooleanField, NumberField, SchemaField, SetField, StringField } = foundry.data.fields;

/**
 * Produce the schema field for a points resource.
 * @param {object} [schemaOptions]    Options passed to the outer schema.
 * @returns {PowerCastingData}
 */
function makePointsResource(schemaOptions = {}) {
	const baseLabel = schemaOptions.label;
	const schemaObj = {
		value: new NumberField({
			nullable: false,
			integer: true,
			min: 0,
			initial: 0,
			label: `${baseLabel}Current`
		}),
		max: new NumberField({
			nullable: true,
			integer: true,
			min: 0,
			initial: null,
			label: `${baseLabel}Override`
		}),
		bonuses: new SchemaField({
			level: new game.dnd5e.dataModels.fields.FormulaField({ deterministic: true, label: `${baseLabel}BonusLevel` }),
			overall: new game.dnd5e.dataModels.fields.FormulaField({ deterministic: true, label: `${baseLabel}BonusOverall` })
		})
	};
	if (schemaOptions.hasTemp) schemaObj.temp = new NumberField({
		integer: true,
		initial: 0,
		min: 0,
		label: `${baseLabel}Temp`
	});
	if (schemaOptions.hasTempMax) schemaObj.tempmax = new NumberField({
		integer: true,
		initial: 0,
		label: `${baseLabel}TempMax`
	});
	return new SchemaField(schemaObj, schemaOptions);
}
function addProgression(wrapped, ...args) {
	const result = wrapped(...args);
	result.spellcasting.fields.forceProgression = new StringField({
		required: true, initial: "none", blank: false, label: "SW5E.Powercasting.Force.Prog.Label"
	});
	result.spellcasting.fields.techProgression = new StringField({
		required: true, initial: "none", blank: false, label: "SW5E.Powercasting.Tech.Prog.Label"
	});
	result.spellcasting.fields.superiorityProgression = new StringField({
		required: true, initial: "none", blank: false, label: "SW5E.Superiority.Prog.Label"
	});
	return result;
}
function addPowercasting(result) {
	result.powercasting = new SchemaField({
		force: new SchemaField({
			known: new SchemaField({
				max: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.Known.Max.Override" })
			}),
			level: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.Level.Override" }),
			limit: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.Limit.Override" }),
			maxPowerLevel: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.MaxPowerLevel.Override" }),
			points: makePointsResource({ label: "SW5E.Powercasting.Force.Point.Label", hasTemp: true, hasTempMax: true }),
			schools: new SchemaField({
				lgt: new SchemaField({
					attr: new StringField({ nullable: true, initial: null, label: "SW5E.Powercasting.Force.School.Lgt.Attr.Override" }),
					dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.School.Lgt.Dc.Override" })
				}),
				uni: new SchemaField({
					attr: new StringField({ nullable: true, initial: null, label: "SW5E.Powercasting.Force.School.Uni.Attr.Override" }),
					dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.School.Uni.Dc.Override" })
				}),
				drk: new SchemaField({
					attr: new StringField({ nullable: true, initial: null, label: "SW5E.Powercasting.Force.School.Drk.Attr.Override" }),
					dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.School.Drk.Dc.Override" })
				})
			}, { label: "SW5E.Powercasting.Force.School.Label" }),
			used: new SetField(new NumberField(), { label: "SW5E.Powercasting.Force.Used" })
		}, { label: "SW5E.Powercasting.Force.Label" }),
		tech: new SchemaField({
			known: new SchemaField({
				max: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Tech.Known.Max.Override" })
			}),
			level: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Tech.Level.Override" }),
			limit: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Tech.Limit.Override" }),
			maxPowerLevel: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Tech.MaxPowerLevel.Override" }),
			points: makePointsResource({ label: "SW5E.Powercasting.Tech.Point.Label", hasTemp: true, hasTempMax: true }),
			schools: new SchemaField({
				tec: new SchemaField({
					attr: new StringField({ nullable: true, initial: null, label: "SW5E.Powercasting.Tech.School.Tec.Attr.Override" }),
					dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Tech.School.Tec.Dc.Override" })
				})
			}, { label: "SW5E.Powercasting.Tech.School.Label" }),
			used: new SetField(new NumberField(), { label: "SW5E.Powercasting.Tech.Used" })
		}, { label: "SW5E.Powercasting.Tech.Label" })
	}, { label: "SW5E.Powercasting.Label" });
}
function addSuperiority(result) {
	result.superiority = new SchemaField({
		known: new SchemaField({
			max: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Superiority.Known.Max.Override" })
		}),
		dice: makePointsResource({ label: "SW5E.Superiority.Dice.Label", hasTemp: true }),
		die: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Superiority.Die.Override" }),
		types: new SchemaField({
			physical: new SchemaField({
				attr: new StringField({ nullable: true, initial: null, label: "SW5E.Superiority.Type.Physical.Attr.Override" }),
				dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Superiority.Type.Physical.Dc.Override" })
			}),
			mental: new SchemaField({
				attr: new StringField({ nullable: true, initial: null, label: "SW5E.Superiority.Type.Mental.Attr.Override" }),
				dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Superiority.Type.Mental.Dc.Override" })
			}),
			general: new SchemaField({
				attr: new StringField({ nullable: true, initial: null, label: "SW5E.Superiority.Type.General.Attr.Override" }),
				dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Superiority.Type.General.Dc.Override" })
			})
		}, { label: "SW5E.Superiority.Type.Label" })
	}, { label: "SW5E.Superiority.Label" });
}
function addLegacyNpcDetailFields(result) {
	const detailsField = result.details;
	const detailSchema = detailsField?.fields ?? detailsField?.model?.fields;
	if ( !detailSchema ) return;

	const legacyLevelFields = {
		powerForceLevel: "SW5E.ForcecasterLevel",
		powerTechLevel: "SW5E.TechcasterLevel",
		superiorityLevel: "SW5E.SuperiorityLevel"
	};

	for (const [key, label] of Object.entries(legacyLevelFields)) {
		if ( key in detailSchema ) continue;
		detailSchema[key] = new NumberField({
			required: true,
			nullable: false,
			integer: true,
			min: 0,
			initial: 0,
			label
		});
	}

	if ( !("tier" in detailSchema) ) {
		detailSchema.tier = new NumberField({
			required: true,
			nullable: false,
			integer: true,
			min: 0,
			initial: 0,
			label: "Tier"
		});
	}
}

function addStarshipRuntimeFields(result) {
	const attributesField = result.attributes;
	const attributeSchema = attributesField?.fields ?? attributesField?.model?.fields;
	if ( !attributeSchema ) return;

	if ( !("systemDamage" in attributeSchema) ) {
		attributeSchema.systemDamage = new NumberField({
			required: true,
			nullable: false,
			integer: true,
			min: 0,
			initial: 0,
			label: "System Damage"
		});
	}

	if ( !("deployment" in attributeSchema) ) {
		attributeSchema.deployment = new SchemaField({
			pilot: new SchemaField({
				value: new StringField({ required: false, nullable: true, initial: null, blank: true }),
				active: new BooleanField({ initial: false })
			}),
			crew: new SchemaField({
				items: new SetField(new StringField({ required: false, nullable: true, initial: null, blank: true })),
				active: new BooleanField({ initial: false })
			}),
			passenger: new SchemaField({
				items: new SetField(new StringField({ required: false, nullable: true, initial: null, blank: true })),
				active: new BooleanField({ initial: false })
			}),
			active: new SchemaField({
				value: new StringField({ required: false, nullable: true, initial: null, blank: true })
			})
		});
	}

	if ( !("fuel" in attributeSchema) ) {
		attributeSchema.fuel = new SchemaField({
			value: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
			cost: new NumberField({ required: true, nullable: false, min: 0, initial: 0 }),
			fuelCap: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
		});
	}

	if ( !("power" in attributeSchema) ) {
		const powerNode = () => new SchemaField({
			value: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
			max: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
		});
		attributeSchema.power = new SchemaField({
			routing: new StringField({ required: true, nullable: false, initial: "none", blank: false }),
			die: new StringField({ required: true, nullable: false, initial: "d1", blank: false }),
			central: powerNode(),
			comms: powerNode(),
			engines: powerNode(),
			shields: powerNode(),
			sensors: powerNode(),
			weapons: powerNode()
		});
	}

	if ( !("hull" in attributeSchema) ) {
		attributeSchema.hull = new SchemaField({
			die: new StringField({ required: true, nullable: false, initial: "d1", blank: false }),
			dicemax: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
			dice: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
		});
	}

	if ( !("shld" in attributeSchema) ) {
		attributeSchema.shld = new SchemaField({
			die: new StringField({ required: true, nullable: false, initial: "d1", blank: false }),
			dicemax: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
			dice: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
		});
	}

	if ( !("mods" in attributeSchema) ) {
		const capField = () => new SchemaField({
			max: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
		});
		attributeSchema.mods = new SchemaField({
			cap: capField(),
			suite: capField(),
			hardpoint: capField()
		});
	}

	if ( !("workforce" in attributeSchema) ) {
		attributeSchema.workforce = new SchemaField({
			minBuild: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
			minEquip: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
			minModification: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
			minUpgrade: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
			max: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
		});
	}

	if ( !("cost" in attributeSchema) ) {
		attributeSchema.cost = new SchemaField({
			baseBuild: new NumberField({ required: true, nullable: false, min: 0, initial: 0 }),
			baseUpgrade: new NumberField({ required: true, nullable: false, min: 0, initial: 0 }),
			multEquip: new NumberField({ required: true, nullable: false, min: 0, initial: 1 }),
			multModification: new NumberField({ required: true, nullable: false, min: 0, initial: 1 }),
			multUpgrade: new NumberField({ required: true, nullable: false, min: 0, initial: 1 })
		});
	}

	if ( !("equip" in attributeSchema) ) {
		attributeSchema.equip = new SchemaField({
			size: new SchemaField({
				cargoCap: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
				crewMinWorkforce: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 }),
				foodCap: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
			}),
			armor: new SchemaField({
				dr: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
				maxDex: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 99 }),
				stealthDisadv: new BooleanField({ initial: false })
			}),
			hyperdrive: new SchemaField({
				class: new NumberField({ required: true, nullable: false, min: 0, initial: 0 })
			}),
			powerCoupling: new SchemaField({
				centralCap: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
				systemCap: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
			}),
			reactor: new SchemaField({
				fuelMult: new NumberField({ required: true, nullable: false, min: 0, initial: 1 }),
				powerRecDie: new StringField({ required: true, nullable: false, initial: "1d1", blank: false })
			}),
			shields: new SchemaField({
				capMult: new NumberField({ required: true, nullable: false, min: 0, initial: 0 }),
				regenRateMult: new NumberField({ required: true, nullable: false, min: 0, initial: 0 })
			})
		});
	}
}

function keepStarshipCreatureType(wrapped, ...args) {
	const result = wrapped(...args);
	if ( !isStarshipCharacterActor(this.parent) ) return result;

	const sourceType = this.parent.system?._source?.details?.type ?? {};
	this.details.type.value = sourceType.value ?? "humanoid";
	this.details.type.subtype = sourceType.subtype ?? "";
	this.details.type.custom = sourceType.custom ?? "";
	return result;
}

function addStarshipTierRollData(wrapped, ...args) {
	const result = wrapped(...args);
	if ( !isStarshipCharacterActor(this) ) return result;

	result.details ??= {};
	result.details.tier = getStarshipTier(this);
	result.details.type ??= {};
	result.details.type.value ??= this.system?.details?.type?.value ?? "humanoid";
	result.skills ??= {};
	for (const skill of buildStarshipSkillEntries(this)) {
		result.skills[skill.key] = {
			ability: skill.ability,
			total: skill.total,
			value: skill.proficiency
		};
	}
	return result;
}

function prepareStarshipCharacterRuntime(wrapped, ...args) {
	const result = wrapped(...args);
	if ( !isStarshipCharacterActor(this.parent) ) return result;

	const runtime = buildStarshipRuntime(this.parent);
	if ( !runtime ) return result;

	this.details.tier = runtime.classification.tier;
	this.traits.size = runtime.classification.size;
	this.attributes.prof = runtime.attributes.prof;
	this.attributes.systemDamage = runtime.attributes.systemDamage;
	this.attributes.deployment = runtime.attributes.deployment;
	this.attributes.fuel = runtime.attributes.fuel;
	this.attributes.hull = runtime.attributes.hull;
	this.attributes.shld = runtime.attributes.shld;
	this.attributes.power = runtime.attributes.power;
	this.attributes.cost = runtime.attributes.cost;
	this.attributes.mods = runtime.attributes.mods;
	this.attributes.workforce = runtime.attributes.workforce;
	this.attributes.equip = runtime.attributes.equip;
	return result;
}
function changeProficiency(result, type) {
	if (type === "creature") {
		result.skills.model.fields.value.max = 5;
		result.abilities.model.fields.proficient.max = 5;
	} else {
		if (type !== "weapon") result.proficient.max = 5;
		result.proficient.integer = false;
		result.proficient.step = 0.5;
	}
}

export function patchDataModels() {
	// Powercasting
	libWrapper.register(getModuleId(), 'dnd5e.dataModels.item.ClassData.defineSchema', addProgression, 'WRAPPER');
	libWrapper.register(getModuleId(), 'dnd5e.dataModels.item.SubclassData.defineSchema', addProgression, 'WRAPPER');
	libWrapper.register(getModuleId(), 'dnd5e.dataModels.actor.CreatureTemplate.defineSchema', function (wrapped, ...args) {
		const result = wrapped(...args);
		addLegacyNpcDetailFields(result);
		addStarshipRuntimeFields(result);
		addPowercasting(result);
		addSuperiority(result);
		changeProficiency(result, "creature");
		return result;
	}, 'WRAPPER');
	libWrapper.register(getModuleId(), 'dnd5e.dataModels.item.ToolData.defineSchema', function (wrapped, ...args) {
		const result = wrapped(...args);
		changeProficiency(result, "tool");
		return result;
	}, 'WRAPPER');
	libWrapper.register(getModuleId(), 'dnd5e.dataModels.item.WeaponData.defineSchema', function (wrapped, ...args) {
		const result = wrapped(...args);
		changeProficiency(result, "weapon");
		return result;
	}, 'WRAPPER');
	libWrapper.register(getModuleId(), 'dnd5e.dataModels.actor.CharacterData.prototype.prepareEmbeddedData', keepStarshipCreatureType, 'WRAPPER');
	libWrapper.register(getModuleId(), 'dnd5e.dataModels.actor.CharacterData.prototype.prepareDerivedData', prepareStarshipCharacterRuntime, 'WRAPPER');
	libWrapper.register(getModuleId(), 'dnd5e.documents.Actor5e.prototype.getRollData', addStarshipTierRollData, 'WRAPPER');

	Object.assign(CONFIG.Item.dataModels, dataModels.item.config);
	const module = getModule();
	const types = Object.keys(module?.documentTypes?.Item ?? {}).flatMap(getModuleTypeCandidates);
	foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, getModuleId(), ItemSheetSW5E, { types, makeDefault: true });
}
