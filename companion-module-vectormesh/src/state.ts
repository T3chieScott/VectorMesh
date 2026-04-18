import type { ScreenPreset, ActivePreset, Screen, ScreenGroup } from './api'

export interface ModuleState {
	presets: ScreenPreset[]
	activePresets: ActivePreset[]
	screens: Screen[]
	groups: ScreenGroup[]
	activeByPresetId: Set<string>
	activePresetByScreenId: Map<string, ActivePreset>
}

export function createEmptyState(): ModuleState {
	return {
		presets: [],
		activePresets: [],
		screens: [],
		groups: [],
		activeByPresetId: new Set(),
		activePresetByScreenId: new Map(),
	}
}

export function recomputeActiveIndexes(state: ModuleState): void {
	state.activeByPresetId = new Set(state.activePresets.map((p) => p.presetId))
	state.activePresetByScreenId = new Map()
	for (const ap of state.activePresets) {
		for (const screenId of ap.screenIds) {
			state.activePresetByScreenId.set(screenId, ap)
		}
	}
}

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 40) || 'unknown'
}
