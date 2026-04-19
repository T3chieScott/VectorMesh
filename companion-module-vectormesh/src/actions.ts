import type { CompanionActionDefinitions, DropdownChoice } from '@companion-module/base'
import type { VectorMeshInstance } from './main'

export function buildActions(self: VectorMeshInstance): CompanionActionDefinitions {
        const presetChoices: DropdownChoice[] = self.state.presets.map((p) => ({
                id: p.id,
                label: p.name,
        }))
        if (presetChoices.length === 0) {
                presetChoices.push({ id: '', label: '— no presets loaded —' })
        }

        const findPresetIdByName = (name: string): string | undefined => {
                const target = name.trim().toLowerCase()
                return self.state.presets.find((p) => p.name.toLowerCase() === target)?.id
        }

        return {
                activate_preset: {
                        name: 'Activate preset',
                        options: [
                                {
                                        id: 'presetId',
                                        type: 'dropdown',
                                        label: 'Preset',
                                        choices: presetChoices,
                                        default: presetChoices[0]?.id ?? '',
                                },
                        ],
                        callback: async (event) => {
                                const id = String(event.options.presetId ?? '')
                                if (!id) return
                                const r = await self.api.activate(id)
                                if (!r.ok) self.log('warn', `Activate failed: ${r.error}`)
                                else void self.refreshActiveSoon()
                        },
                },
                deactivate_preset: {
                        name: 'Deactivate preset',
                        options: [
                                {
                                        id: 'presetId',
                                        type: 'dropdown',
                                        label: 'Preset',
                                        choices: presetChoices,
                                        default: presetChoices[0]?.id ?? '',
                                },
                        ],
                        callback: async (event) => {
                                const id = String(event.options.presetId ?? '')
                                if (!id) return
                                const r = await self.api.deactivate(id)
                                if (!r.ok) self.log('warn', `Deactivate failed: ${r.error}`)
                                else void self.refreshActiveSoon()
                        },
                },
                toggle_preset: {
                        name: 'Toggle preset',
                        options: [
                                {
                                        id: 'presetId',
                                        type: 'dropdown',
                                        label: 'Preset',
                                        choices: presetChoices,
                                        default: presetChoices[0]?.id ?? '',
                                },
                        ],
                        callback: async (event) => {
                                const id = String(event.options.presetId ?? '')
                                if (!id) return
                                const isActive = self.state.activeByPresetId.has(id)
                                const r = isActive ? await self.api.deactivate(id) : await self.api.activate(id)
                                if (!r.ok) self.log('warn', `Toggle failed: ${r.error}`)
                                else void self.refreshActiveSoon()
                        },
                },
                test_connection: {
                        name: 'Test connection',
                        description:
                                'Calls GET /api/screen-presets once and reports OK / Bad token / Unreachable to the module log and status indicator. ' +
                                'Useful as a one-click test from a Companion button without re-saving the module config.',
                        options: [],
                        callback: async () => {
                                await self.runTestConnection('action')
                        },
                },
                activate_by_name: {
                        name: 'Activate preset by name',
                        options: [
                                {
                                        id: 'name',
                                        type: 'textinput',
                                        label: 'Preset name (supports variables)',
                                        default: '',
                                        useVariables: true,
                                },
                        ],
                        callback: async (event) => {
                                const name = await self.parseVariablesInString(String(event.options.name ?? ''))
                                if (!name.trim()) return
                                const id = findPresetIdByName(name)
                                if (!id) {
                                        self.log('warn', `No preset matches name "${name}"`)
                                        return
                                }
                                const r = await self.api.activate(id)
                                if (!r.ok) self.log('warn', `Activate failed: ${r.error}`)
                                else void self.refreshActiveSoon()
                        },
                },
        }
}
