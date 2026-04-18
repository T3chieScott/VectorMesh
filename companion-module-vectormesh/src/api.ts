export interface ScreenPreset {
	id: string
	name: string
	screenId?: string | null
	groupId?: string | null
}

export interface ActivePreset {
	presetId: string
	presetName: string
	screenIds: string[]
	since: string | null
}

export interface Screen {
	id: string
	name: string
}

export interface ScreenGroup {
	id: string
	name: string
}

export type ApiHealth = 'ok' | 'bad-auth' | 'unreachable' | 'unknown-error'

export interface ApiResult<T> {
	ok: boolean
	status: number
	data?: T
	error?: string
}

export class VectorMeshApi {
	constructor(private url: string, private token: string) {}

	private headers(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		}
	}

	private async req<T>(method: string, path: string): Promise<ApiResult<T>> {
		if (!this.url || !this.token) {
			return { ok: false, status: 0, error: 'URL or token not configured' }
		}
		try {
			const res = await fetch(`${this.url}${path}`, {
				method,
				headers: this.headers(),
			})
			if (res.status === 401 || res.status === 403) {
				return { ok: false, status: res.status, error: 'Unauthorized' }
			}
			if (!res.ok) {
				const text = await res.text().catch(() => '')
				return { ok: false, status: res.status, error: text || `HTTP ${res.status}` }
			}
			let data: T | undefined
			if (method === 'GET') {
				data = (await res.json()) as T
			}
			return { ok: true, status: res.status, data }
		} catch (err) {
			return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
		}
	}

	async health(): Promise<ApiHealth> {
		const r = await this.req<ScreenPreset[]>('GET', '/api/screen-presets')
		if (r.ok) return 'ok'
		if (r.status === 401 || r.status === 403) return 'bad-auth'
		if (r.status === 0) return 'unreachable'
		return 'unknown-error'
	}

	listPresets(): Promise<ApiResult<ScreenPreset[]>> {
		return this.req<ScreenPreset[]>('GET', '/api/screen-presets')
	}

	listActivePresets(): Promise<ApiResult<ActivePreset[]>> {
		return this.req<ActivePreset[]>('GET', '/api/screen-presets/active')
	}

	listScreens(): Promise<ApiResult<Screen[]>> {
		return this.req<Screen[]>('GET', '/api/screens')
	}

	listScreenGroups(): Promise<ApiResult<ScreenGroup[]>> {
		return this.req<ScreenGroup[]>('GET', '/api/screen-groups')
	}

	activate(presetId: string): Promise<ApiResult<void>> {
		return this.req<void>('POST', `/api/screen-presets/${encodeURIComponent(presetId)}/activate`)
	}

	deactivate(presetId: string): Promise<ApiResult<void>> {
		return this.req<void>('POST', `/api/screen-presets/${encodeURIComponent(presetId)}/deactivate`)
	}
}
