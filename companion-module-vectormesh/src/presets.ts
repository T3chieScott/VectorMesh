import type { CompanionPresetDefinitions } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { VectorMeshInstance } from './main'

export function buildPresets(self: VectorMeshInstance): CompanionPresetDefinitions {
	const presets: CompanionPresetDefinitions = {}
	for (const p of self.state.presets) {
		presets[`toggle_${p.id}`] = {
			type: 'button',
			category: 'Presets',
			name: p.name,
			style: {
				text: p.name,
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 0, 0),
			},
			steps: [
				{
					down: [
						{
							actionId: 'toggle_preset',
							options: { presetId: p.id },
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'preset_active',
					options: { presetId: p.id },
					style: {
						bgcolor: combineRgb(0, 170, 0),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		}
	}
	return presets
}
