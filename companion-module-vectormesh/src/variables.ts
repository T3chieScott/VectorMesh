import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'
import type { VectorMeshInstance } from './main'

/**
 * Companion variable IDs must match [a-zA-Z0-9_]. We derive a stable suffix
 * from the server-assigned screen.id (a UUID), simply replacing dashes with
 * underscores. The human-readable screen name is only used in the displayed
 * `name` field, so renaming a screen never invalidates the variable key.
 */
function screenVarSuffix(screenId: string): string {
	return screenId.replace(/[^a-zA-Z0-9]/g, '_')
}

export function buildVariableDefinitions(self: VectorMeshInstance): CompanionVariableDefinition[] {
	const defs: CompanionVariableDefinition[] = [
		{ variableId: 'active_presets_count', name: 'Number of presets currently live' },
	]
	for (const screen of self.state.screens) {
		defs.push({
			variableId: `active_preset_${screenVarSuffix(screen.id)}`,
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
		values[`active_preset_${screenVarSuffix(screen.id)}`] = ap?.presetName ?? ''
	}
	return values
}
