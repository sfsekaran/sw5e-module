const { ArrayField, BooleanField, NumberField, ObjectField, SchemaField, StringField } = foundry.data.fields;

export class StarshipData extends dnd5e.dataModels.actor.VehicleData {
	static defineSchema() {
		const schema = super.defineSchema();
		const FormulaField = dnd5e.dataModels.fields.FormulaField;

		// Extend attributes with starship-specific fields
		Object.assign(schema.attributes.fields, {
			systemDamage: new NumberField({ nullable: false, integer: true, min: 0, initial: 0 }),
			fuel: new SchemaField({
				value: new NumberField({ nullable: false, integer: true, min: 0, initial: 0 })
			}),
			power: new SchemaField({
				routing: new StringField({ initial: "none" }),
				central: new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) }),
				comms:   new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) }),
				engines: new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) }),
				shields: new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) }),
				sensors: new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) }),
				weapons: new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) })
			}),
			deployment: new SchemaField({
				pilot:     new SchemaField({
					value: new StringField({ initial: "" }),
					active: new BooleanField({ initial: false })
				}),
				crew:      new SchemaField({
					items: new ArrayField(new StringField()),
					active: new BooleanField({ initial: false })
				}),
				passenger: new SchemaField({
					items: new ArrayField(new StringField()),
					active: new BooleanField({ initial: false })
				})
			})
		});

		// Extend details with starship size
		schema.details.fields.starshipsize = new StringField({ initial: "" });

		// Starship skills (stored as a free-form mapping so existing compendium keys are preserved)
		schema.skills = new dnd5e.dataModels.fields.MappingField(
			new SchemaField({
				value:   new NumberField({ nullable: false, integer: true, min: 0, initial: 0 }),
				ability: new StringField({ initial: "int" }),
				bonuses: new SchemaField({
					check:   new FormulaField({ initial: "" }),
					passive: new FormulaField({ initial: "" })
				})
			}),
			{ initialKeysOnly: false }
		);

		schema.favorites = new ArrayField(new ObjectField());

		return schema;
	}
}
