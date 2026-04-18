import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { getConfigFields, normalizeConfig, type ModuleConfig } from './config'
import { VectorMeshApi } from './api'
import { createEmptyState, recomputeActiveIndexes, type ModuleState } from './state'
import { buildActions } from './actions'
import { buildFeedbacks } from './feedbacks'
import { buildVariableDefinitions, buildVariableValues } from './variables'
import { buildPresets } from './presets'

const PRESETS_REFRESH_EVERY_N_TICKS = 15 // at 2s poll, refresh presets list every 30s

export class VectorMeshInstance extends InstanceBase<ModuleConfig> {
	public api!: VectorMeshApi
	public state: ModuleState = createEmptyState()
	private cfg!: ModuleConfig
	private pollTimer: NodeJS.Timeout | null = null
	private tickCount = 0
	private consecutiveFailures = 0
	private refreshSoonTimer: NodeJS.Timeout | null = null

	async init(config: ModuleConfig): Promise<void> {
		this.cfg = normalizeConfig(config)
		this.api = new VectorMeshApi(this.cfg.url, this.cfg.token)
		this.updateStatus(InstanceStatus.Connecting)
		await this.refreshAll(true)
		this.startPolling()
	}

	async destroy(): Promise<void> {
		this.stopPolling()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return getConfigFields()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.cfg = normalizeConfig(config)
		this.api = new VectorMeshApi(this.cfg.url, this.cfg.token)
		this.consecutiveFailures = 0
		this.updateStatus(InstanceStatus.Connecting)
		this.stopPolling()
		await this.refreshAll(true)
		this.startPolling()
	}

	private startPolling(): void {
		this.stopPolling()
		this.pollTimer = setInterval(() => {
			void this.tick()
		}, this.cfg.pollInterval * 1000)
	}

	private stopPolling(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}
		if (this.refreshSoonTimer) {
			clearTimeout(this.refreshSoonTimer)
			this.refreshSoonTimer = null
		}
	}

	/** Schedule an extra active-state refresh shortly after a write action. */
	refreshAllNow(): Promise<void> {
		return this.refreshAll(false)
	}

	refreshActiveSoon(): void {
		if (this.refreshSoonTimer) return
		this.refreshSoonTimer = setTimeout(() => {
			this.refreshSoonTimer = null
			void this.refreshActiveOnly()
		}, 250)
	}

	private async tick(): Promise<void> {
		this.tickCount++
		try {
			if (this.tickCount % PRESETS_REFRESH_EVERY_N_TICKS === 0) {
				await this.refreshAll(false)
			} else {
				await this.refreshActiveOnly()
			}
		} catch (err) {
			this.log('error', `Poll tick crashed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	private async refreshAll(initial: boolean): Promise<void> {
		const [presetsRes, screensRes, groupsRes, activeRes] = await Promise.all([
			this.api.listPresets(),
			this.api.listScreens(),
			this.api.listScreenGroups(),
			this.api.listActivePresets(),
		])
		const fail = [presetsRes, screensRes, groupsRes, activeRes].find((r) => !r.ok)
		if (fail) {
			this.handleFailure(fail.status, fail.error ?? 'Unknown error')
			if (initial) {
				// still publish empty defs so Companion shows the module
				this.publishDefinitions()
			}
			return
		}
		this.consecutiveFailures = 0
		this.state.presets = presetsRes.data ?? []
		this.state.screens = screensRes.data ?? []
		this.state.groups = groupsRes.data ?? []
		this.state.activePresets = activeRes.data ?? []
		recomputeActiveIndexes(this.state)
		this.updateStatus(InstanceStatus.Ok)
		this.publishDefinitions()
	}

	private async refreshActiveOnly(): Promise<void> {
		const r = await this.api.listActivePresets()
		if (!r.ok) {
			this.handleFailure(r.status, r.error ?? 'Unknown error')
			return
		}
		this.consecutiveFailures = 0
		this.state.activePresets = r.data ?? []
		recomputeActiveIndexes(this.state)
		this.checkFeedbacks('preset_active', 'any_preset_active_on_screen')
		this.setVariableValues(buildVariableValues(this))
		if (this.tickCount > 0) this.updateStatus(InstanceStatus.Ok)
	}

	private handleFailure(status: number, message: string): void {
		this.consecutiveFailures++
		if (status === 401 || status === 403) {
			this.updateStatus(InstanceStatus.AuthenticationFailure, message)
			return
		}
		if (this.consecutiveFailures >= 3) {
			this.updateStatus(
				status === 0 ? InstanceStatus.ConnectionFailure : InstanceStatus.UnknownError,
				message,
			)
		}
	}

	private publishDefinitions(): void {
		this.setActionDefinitions(buildActions(this))
		this.setFeedbackDefinitions(buildFeedbacks(this))
		this.setPresetDefinitions(buildPresets(this))
		this.setVariableDefinitions(buildVariableDefinitions(this))
		this.setVariableValues(buildVariableValues(this))
		this.checkFeedbacks('preset_active', 'any_preset_active_on_screen')
	}
}

runEntrypoint(VectorMeshInstance, [])
