import type { CompanionFeedbackDefinitions, DropdownChoice } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { VectorMeshInstance } from './main'

export function buildFeedbacks(self: VectorMeshInstance): CompanionFeedbackDefinitions {
	const presetChoices: DropdownChoice[] = self.state.presets.map((p) => ({
		id: p.id,
		label: p.name,
	}))
	if (presetChoices.length === 0) {
		presetChoices.push({ id: '', label: '— no presets loaded —' })
	}

	const screenChoices: DropdownChoice[] = self.state.screens.map((s) => ({
		id: s.id,
		label: s.name,
	}))
	if (screenChoices.length === 0) {
		screenChoices.push({ id: '', label: '— no screens loaded —' })
	}

	return {
		preset_active: {
			type: 'boolean',
			name: 'Preset is active',
			description: 'Highlight a button when its preset is currently live',
			defaultStyle: {
				bgcolor: combineRgb(0, 170, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'presetId',
					type: 'dropdown',
					label: 'Preset',
					choices: presetChoices,
					default: presetChoices[0]?.id ?? '',
				},
			],
			callback: (feedback) => {
				const id = String(feedback.options.presetId ?? '')
				return id ? self.state.activeByPresetId.has(id) : false
			},
		},
		any_preset_active_on_screen: {
			type: 'boolean',
			name: 'Any preset active on screen',
			description: 'Highlight when any preset is driving the selected screen',
			defaultStyle: {
				bgcolor: combineRgb(0, 100, 200),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'screenId',
					type: 'dropdown',
					label: 'Screen',
					choices: screenChoices,
					default: screenChoices[0]?.id ?? '',
				},
			],
			callback: (feedback) => {
				const id = String(feedback.options.screenId ?? '')
				return id ? self.state.activePresetByScreenId.has(id) : false
			},
		},
	}
}
