import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { getConfigFields, normalizeConfig, type ModuleConfig } from './config'
import { VectorMeshApi } from './api'
import { createEmptyState, recomputeActiveIndexes, type ModuleState } from './state'
import { buildActions } from './actions'
import { buildFeedbacks } from './feedbacks'
import { buildVariableDefinitions, buildVariableValues } from './variables'
import { buildPresets } from './presets'

const PRESETS_REFRESH_EVERY_N_TICKS = 15 // at 2s poll, refresh preset list ~30s

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
		// Always publish empty defs first so Companion shows the module even on bad config
		this.publishDefinitions()
		const ok = await this.validateConfig()
		if (ok) {
			await this.refreshAll()
			this.startPolling()
		}
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
		this.tickCount = 0
		this.stopPolling()
		this.publishDefinitions()
		const ok = await this.validateConfig()
		if (ok) {
			await this.refreshAll()
			this.startPolling()
		}
	}

	/**
	 * Single-call validation against the one required endpoint (/api/screen-presets).
	 * Returns true if the config is usable and polling should start.
	 */
	private async validateConfig(): Promise<boolean> {
		if (!this.cfg.url || !this.cfg.token) {
			this.updateStatus(InstanceStatus.BadConfig, 'Server URL and API token are required')
			return false
		}
		this.updateStatus(InstanceStatus.Connecting)
		const r = await this.api.listPresets()
		if (r.ok) {
			this.updateStatus(InstanceStatus.Ok)
			return true
		}
		if (r.status === 401 || r.status === 403) {
			this.updateStatus(InstanceStatus.AuthenticationFailure, 'Invalid or revoked API token')
		} else if (r.status === 0) {
			this.updateStatus(InstanceStatus.ConnectionFailure, r.error ?? 'Server unreachable')
		} else {
			this.updateStatus(InstanceStatus.UnknownError, r.error ?? `HTTP ${r.status}`)
		}
		return false
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
				await this.refreshAll()
			} else {
				await this.refreshActiveOnly()
			}
		} catch (err) {
			this.log('error', `Poll tick crashed: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	/**
	 * Refresh required state (presets + active) and best-effort enrichment
	 * (screens + groups). Failure of the optional endpoints does NOT flip
	 * status — only required-endpoint failures do.
	 */
	private async refreshAll(): Promise<void> {
		const [presetsRes, activeRes, screensRes, groupsRes] = await Promise.all([
			this.api.listPresets(),
			this.api.listActivePresets(),
			this.api.listScreens(),
			this.api.listScreenGroups(),
		])

		// Required endpoints
		const requiredFail = !presetsRes.ok ? presetsRes : !activeRes.ok ? activeRes : null
		if (requiredFail) {
			this.handleRequiredFailure(requiredFail.status, requiredFail.error ?? 'Unknown error')
			return
		}
		this.consecutiveFailures = 0
		this.state.presets = presetsRes.data ?? []
		this.state.activePresets = activeRes.data ?? []

		// Optional enrichment — keep last known list on failure
		if (screensRes.ok) this.state.screens = screensRes.data ?? []
		else this.log('debug', `Optional /api/screens fetch failed: ${screensRes.error}`)
		if (groupsRes.ok) this.state.groups = groupsRes.data ?? []
		else this.log('debug', `Optional /api/screen-groups fetch failed: ${groupsRes.error}`)

		recomputeActiveIndexes(this.state)
		this.updateStatus(InstanceStatus.Ok)
		this.publishDefinitions()
	}

	private async refreshActiveOnly(): Promise<void> {
		const r = await this.api.listActivePresets()
		if (!r.ok) {
			this.handleRequiredFailure(r.status, r.error ?? 'Unknown error')
			return
		}
		this.consecutiveFailures = 0
		this.state.activePresets = r.data ?? []
		recomputeActiveIndexes(this.state)
		this.checkFeedbacks('preset_active', 'any_preset_active_on_screen')
		this.setVariableValues(buildVariableValues(this))
		this.updateStatus(InstanceStatus.Ok)
	}

	private handleRequiredFailure(status: number, message: string): void {
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
