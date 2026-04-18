import type { SomeCompanionConfigField } from '@companion-module/base'
import { Regex } from '@companion-module/base'

export interface ModuleConfig {
	url: string
	token: string
	pollInterval: number
}

export function getConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Information',
			width: 12,
			value:
				'Control VectorMesh display presets from Companion. Generate an API token in VectorMesh under Settings → API Tokens.',
		},
		{
			type: 'textinput',
			id: 'url',
			label: 'VectorMesh server URL',
			tooltip: 'e.g. https://vectormesh.4wallcloud.com (no trailing slash)',
			width: 8,
			regex: Regex.URL,
			default: 'https://vectormesh.4wallcloud.com',
		},
		{
			type: 'textinput',
			id: 'token',
			label: 'API Token',
			tooltip: 'Bearer token from Settings → API Tokens (starts with vm_)',
			width: 8,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll interval (seconds)',
			tooltip: 'How often to refresh active-preset state (1–10s).',
			width: 4,
			min: 1,
			max: 10,
			default: 2,
			step: 1,
			required: true,
		},
	]
}

export function normalizeConfig(input: Partial<ModuleConfig> | undefined): ModuleConfig {
	const url = (input?.url ?? '').trim().replace(/\/+$/, '')
	const token = (input?.token ?? '').trim()
	let pollInterval = Number(input?.pollInterval ?? 2)
	if (!Number.isFinite(pollInterval)) pollInterval = 2
	pollInterval = Math.min(10, Math.max(1, Math.round(pollInterval)))
	return { url, token, pollInterval }
}
