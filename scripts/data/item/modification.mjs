const { BooleanField, SchemaField, StringField } = foundry.data.fields;

export default class ModificationData extends dnd5e.dataModels.item.FeatData {
	static defineSchema() {
		const schema = super.defineSchema();

		schema.modifying = new SchemaField({
			id:       new StringField({ nullable: true, initial: null }),
			disabled: new BooleanField({ initial: false })
		});

		return schema;
	}
}
