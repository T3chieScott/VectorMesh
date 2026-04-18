import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'
import type { VectorMeshInstance } from './main'
import { slugify } from './state'

export function buildVariableDefinitions(self: VectorMeshInstance): CompanionVariableDefinition[] {
	const defs: CompanionVariableDefinition[] = [
		{ variableId: 'active_presets_count', name: 'Number of presets currently live' },
	]
	for (const screen of self.state.screens) {
		defs.push({
			variableId: `active_preset_${slugify(screen.name)}`,
			name: `Active preset on screen "${screen.name}"`,
		})
	}
	return defs
}

export function buildVariableValues(self: VectorMeshInstance): CompanionVariableValues {
	const values: CompanionVariableValues = {
		active_presets_count: self.state.activePresets.length,
	}
	for (const screen of self.state.screens) {
		const ap = self.state.activePresetByScreenId.get(screen.id)
		values[`active_preset_${slugify(screen.name)}`] = ap?.presetName ?? ''
	}
	return values
}
