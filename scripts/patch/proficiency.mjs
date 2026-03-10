function adjustProficiencyObject() {
	libWrapper.register('sw5e', 'dnd5e.documents.Proficiency.prototype.flat', function (wrapped, ...args) {
		this.multiplier = Math.min(this.multiplier, 2);
		return wrapped(...args);
	}, 'MIXED' );

	libWrapper.register('sw5e', 'dnd5e.documents.Proficiency.prototype.dice', function (wrapped, ...args) {
		this.multiplier = Math.min(this.multiplier, 2);
		return wrapped(...args);
	}, 'MIXED' );
}

// dataModels file changes:
// - skills and abilities max proficiency is 5 on CreatureTemplate
// - proficiency can be 0.5 on WeaponData
// - proficiency can be 0.5 and has a max of 5 on ToolData

function registerProficiencyOverride(id, handler, mode='OVERRIDE') {
	try {
		libWrapper.register('sw5e', id, handler, mode);
	} catch(err) {
		console.warn(`SW5E | Skipping incompatible proficiency wrapper target '${id}'.`, err);
	}
}

function adjustProficiencyCycleElement() {
	const ProficiencyCycleElement = dnd5e?.applications?.components?.ProficiencyCycleElement;
	if ( !ProficiencyCycleElement ) return;

	ProficiencyCycleElement.CSS = `
		:host { display: inline-block; }
		div { --_fill: var(--proficiency-cycle-enabled-color, var(--dnd5e-color-blue)); }
		div:has(:disabled, :focus-visible) { --_fill: var(--proficiency-cycle-disabled-color, var(--dnd5e-color-gold)); }
		div:not(:has(:disabled)) { cursor: pointer; }

		div {
			position: relative;
			overflow: clip;
			width: 100%;
			aspect-ratio: 1;

			&::before {
				content: "";
				position: absolute;
				display: block;
				inset: 3px;
				border: 1px solid var(--_fill);
				border-radius: 100%;
			}

			&:has([value="1"])::before { background: var(--_fill); }

			&:has([value="0.5"], [value="2"])::after {
				content: "";
				position: absolute;
				background: var(--_fill);  
			}

			&:has([value="0.5"])::after {
				inset: 4px;
				width: 4px;
				aspect-ratio: 1 / 2;
				border-radius: 100% 0 0 100%;
			}

			&:has([value="2"]) {
				&::before {
					inset: 1px;
					border-width: 2px;
				}

				&::after {
					inset: 5px;
					border-radius: 100%;
				}
			}

			&:has([value="3"]) {
				&::before {
					inset: 1px;
					border-width: 3px;
				}

				&::after {
					inset: 5px;
					border-radius: 100%;
				}
			}

			&:has([value="4"]) {
				&::before {
					inset: 1px;
					border-width: 4px;
				}

				&::after {
					inset: 5px;
					border-radius: 100%;
				}
			}

			&:has([value="5"]) {
				&::before {
					inset: 1px;
					border-width: 5px;
				}

				&::after {
					inset: 5px;
					border-radius: 100%;
				}
			}
		}

		input {
			position: absolute;
			inset-block-start: -100px;
			width: 1px;
			height: 1px;
			opacity: 0;
		}
	`;

	registerProficiencyOverride('dnd5e.applications.components.ProficiencyCycleElement.prototype.type#set', function ( value ) {
		if ( !["ability", "skill", "tool", "weapon"].includes( value ) ) throw new Error( "Type must be 'ability', 'skill', 'tool', or 'weapon'." );
		this.setAttribute( "type", value );
		const internals = this["#internals"] ?? this.internals ?? this._internals;
		if ( internals ) {
			internals.ariaValueMin = 0;
			internals.ariaValueMax = value === "weapon" ? 1 : 5;
			internals.ariaValueStep = 0.5;
		} else {
			this.setAttribute("aria-valuemin", 0);
			this.setAttribute("aria-valuemax", value === "weapon" ? 1 : 5);
			this.setAttribute("aria-valuestep", 0.5);
		}
	});

	registerProficiencyOverride('dnd5e.applications.components.ProficiencyCycleElement.prototype.validValues', function () {
		return this.type === "weapon" ? [0, 0.5, 1] : [0, 1, .5, 2, 3, 4, 5];
	});
}

export function patchProficiencyInit() {
	adjustProficiencyObject();
}

export function patchProficiencyReady() {
	adjustProficiencyCycleElement();
}
