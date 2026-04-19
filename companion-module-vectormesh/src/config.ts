import type { SomeCompanionConfigField } from '@companion-module/base'

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
                        type: 'static-text',
                        id: 'test_connection',
                        label: 'Test connection',
                        width: 12,
                        value:
                                'Click <b>Save</b> to test the connection to VectorMesh — a single call to <code>GET /api/screen-presets</code> runs immediately. ' +
                                'The module status indicator at the top of this page will then show one of:<br/>' +
                                '&nbsp;&nbsp;• <b>OK</b> — token works and presets were fetched.<br/>' +
                                '&nbsp;&nbsp;• <b>Bad token</b> — the API token was rejected (401/403). Check it under VectorMesh → Settings → API Tokens.<br/>' +
                                '&nbsp;&nbsp;• <b>Unreachable</b> — the server URL did not respond. Check the URL, network, and TLS.<br/>' +
                                'You can also re-run the test any time without re-saving by triggering the <b>Test connection</b> action from any Companion button.',
                },
                {
                        type: 'textinput',
                        id: 'url',
                        label: 'VectorMesh server URL',
                        tooltip: 'e.g. https://vectormesh.4wallcloud.com (no trailing slash)',
                        width: 8,
                        regex: '/^https?:\\/\\/.+/',
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
