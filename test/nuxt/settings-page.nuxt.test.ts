import { defineComponent, nextTick, reactive } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SelectPitchRange from '~/components/settings/SelectPitchRange.vue'
import SelectorTurntableFinish from '~/components/settings/SelectorTurntableFinish.vue'
import SettingsPage from '~/pages/settings.vue'
import type {
	LibraryLocation,
	WorkbenchCapabilities
} from '~/repositories/library/contracts'
import type { LibraryPreferences } from '~~/shared/types/library'
import type { Profile } from '~~/shared/types/supabase'

const factories = vi.hoisted(() => ({
	capabilities: vi.fn(),
	preferences: vi.fn(),
	user: vi.fn()
}))

mockNuxtImport('useWorkbenchCapabilities', () => factories.capabilities)
mockNuxtImport('useWorkbenchUserStore', () => factories.user)
mockNuxtImport('useWorkbenchPreferencesStore', () => factories.preferences)

const ValueControlStub = defineComponent({
	props: {
		modelValue: {
			type: [String, Number],
			default: undefined
		}
	},
	emits: ['update:modelValue'],
	template: `
		<div data-testid="value-control" :data-value="modelValue">
			<button type="button" data-set-value="8" @click="$emit('update:modelValue', '8')">8</button>
			<button type="button" data-set-value="24" @click="$emit('update:modelValue', '24')">24</button>
			<button type="button" data-set-value="50" @click="$emit('update:modelValue', '50')">50</button>
			<button type="button" data-set-value="silver" @click="$emit('update:modelValue', 'silver')">Silver</button>
			<button type="button" data-set-value="black" @click="$emit('update:modelValue', 'black')">Black</button>
			<slot />
		</div>
	`
})

function createUser(profile: Profile | null = null) {
	return reactive({
		profile,
		supaUser: {
			email: 'listener@example.com',
			user_metadata: { full_name: 'Test Listener' }
		},
		signOut: vi.fn()
	})
}

function createPreferences(overrides: Partial<LibraryPreferences> = {}) {
	return reactive({
		preferences: {
			ui_theme: 'light',
			key_format: 'camelot',
			list_layout: 'grid',
			selected_crate: 'all',
			turntable_pitch_range: 8,
			turntable_theme: 'silver',
			...overrides
		} as LibraryPreferences,
		updatePreferences: vi.fn().mockResolvedValue(true)
	})
}

function createCapabilities(location: LibraryLocation): WorkbenchCapabilities {
	const isCloud = location === 'cloud'
	return {
		location,
		canPersistSessions: isCloud,
		canMutateLibrary: isCloud,
		canManageCrates: isCloud,
		canConnectDiscogs: isCloud,
		canEnrichTracks: isCloud,
		canManageAccount: isCloud
	}
}

let wrapper: VueWrapper | null = null

describe('settings page', () => {
	beforeEach(() => {
		factories.capabilities.mockReturnValue(createCapabilities('cloud'))
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		factories.user.mockReset()
		factories.preferences.mockReset()
		factories.capabilities.mockReset()
		vi.clearAllMocks()
	})

	it.each([
		[
			'cloud' as const,
			'Cloud backup on',
			'Saved to your Cloud library and available after sign-in.'
		],
		[
			'browser' as const,
			'This browser only',
			'Saved only in this browser. Not backed up to Crate Guide.'
		],
		[
			'demo' as const,
			'Temporary Demo',
			'Changes last only for this Demo session.'
		]
	])(
		'describes %s preference durability honestly',
		async (location, badge, description) => {
			factories.capabilities.mockReturnValue(createCapabilities(location))
			factories.user.mockReturnValue(createUser())
			factories.preferences.mockReturnValue(createPreferences())
			wrapper = await mountSuspended(SettingsPage, {
				global: {
					stubs: {
						CardLocalAudioCache: true,
						DetailsDiscogsAuth: true,
						DialogClearAllData: true,
						DialogDeleteAccount: true,
						SelectPitchRange: true,
						SelectorKeyFormat: true,
						SelectorTheme: true,
						SelectorTurntableFinish: true
					}
				}
			})

			const durability = wrapper.get('[data-testid="preference-durability"]')
			expect(durability.text()).toContain(badge)
			expect(
				wrapper.get('[data-testid="preference-durability-copy"]').text()
			).toBe(description)
		}
	)

	it('owns a bounded scroll container and exposes project links', async () => {
		factories.user.mockReturnValue(createUser())
		factories.preferences.mockReturnValue(createPreferences())
		wrapper = await mountSuspended(SettingsPage, {
			global: {
				stubs: {
					CardLocalAudioCache: true,
					DetailsDiscogsAuth: true,
					DialogClearAllData: true,
					DialogDeleteAccount: true,
					SelectPitchRange: true,
					SelectorKeyFormat: true,
					SelectorTheme: true,
					SelectorTurntableFinish: true
				}
			}
		})

		const scrollContainer = wrapper.get('[data-settings-scroll-container]')
		expect(scrollContainer.classes()).toEqual(
			expect.arrayContaining([
				'h-full',
				'min-h-0',
				'overflow-y-auto',
				'overscroll-contain'
			])
		)

		expect(wrapper.get('#about').text()).toContain('About Crate Guide')
		expect(wrapper.find('#local-storage').exists()).toBe(true)
		const projectLinks = wrapper.get('nav[aria-label="Project links"]')
		const sourceLink = projectLinks
			.findAll('a')
			.find((link) =>
				link.attributes('href')?.startsWith('https://github.com/')
			)
		expect(projectLinks.get('a[href="/privacy"]').text()).toBe('Privacy')
		expect(projectLinks.get('a[href="/terms"]').text()).toBe('Terms')
		expect(sourceLink?.attributes('href')).toBe(
			'https://github.com/ryan-voitiskis/crate-guide'
		)
		expect(sourceLink?.text()).toBe('Source')
	})

	it('hydrates pitch range without writing and persists one user change', async () => {
		const user = createUser()
		const preferences = createPreferences()
		factories.user.mockReturnValue(user)
		factories.preferences.mockReturnValue(preferences)
		wrapper = await mountSuspended(SelectPitchRange, {
			global: {
				stubs: {
					Select: ValueControlStub,
					SelectContent: true,
					SelectGroup: true,
					SelectItem: true,
					SelectTrigger: true,
					SelectValue: true
				}
			}
		})

		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('8')
		preferences.preferences.turntable_pitch_range = 16
		preferences.preferences.turntable_theme = 'black'
		await nextTick()

		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('16')
		expect(preferences.updatePreferences).not.toHaveBeenCalled()

		await wrapper.get('[data-set-value="24"]').trigger('click')
		expect(preferences.updatePreferences).toHaveBeenCalledOnce()
		expect(preferences.updatePreferences).toHaveBeenCalledWith({
			turntable_pitch_range: 24
		})

		preferences.preferences.turntable_pitch_range = 50
		await nextTick()
		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('50')
		expect(preferences.updatePreferences).toHaveBeenCalledOnce()
	})

	it('uses the repository default while preferences are hydrating', async () => {
		const user = createUser({
			id: 'listener-user-id',
			key_format: 'camelot',
			ui_theme: 'light'
		} as Profile)
		const preferences = createPreferences()
		factories.user.mockReturnValue(user)
		factories.preferences.mockReturnValue(preferences)
		wrapper = await mountSuspended(SelectPitchRange, {
			global: {
				stubs: {
					Select: ValueControlStub,
					SelectContent: true,
					SelectGroup: true,
					SelectItem: true,
					SelectTrigger: true,
					SelectValue: true
				}
			}
		})

		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('8')
		expect(preferences.updatePreferences).not.toHaveBeenCalled()
	})

	it('hydrates turntable finish without writing and persists one user change', async () => {
		const user = createUser()
		const preferences = createPreferences()
		factories.user.mockReturnValue(user)
		factories.preferences.mockReturnValue(preferences)
		wrapper = await mountSuspended(SelectorTurntableFinish, {
			global: {
				stubs: {
					RadioGroup: ValueControlStub,
					RadioGroupItem: true
				}
			}
		})

		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('silver')
		preferences.preferences.turntable_pitch_range = 16
		preferences.preferences.turntable_theme = 'black'
		await nextTick()

		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('black')
		expect(preferences.updatePreferences).not.toHaveBeenCalled()

		await wrapper.get('[data-set-value="silver"]').trigger('click')
		expect(preferences.updatePreferences).toHaveBeenCalledOnce()
		expect(preferences.updatePreferences).toHaveBeenCalledWith({
			turntable_theme: 'silver'
		})

		preferences.preferences.turntable_theme = 'black'
		await nextTick()
		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('black')
		expect(preferences.updatePreferences).toHaveBeenCalledOnce()
	})
})
