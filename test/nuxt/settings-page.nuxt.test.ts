import { defineComponent, nextTick, reactive } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SelectPitchRange from '~/components/settings/SelectPitchRange.vue'
import SelectorTurntableFinish from '~/components/settings/SelectorTurntableFinish.vue'
import SettingsPage from '~/pages/settings.vue'
import type { Profile } from '~~/shared/types/supabase'

const factories = vi.hoisted(() => ({
	user: vi.fn()
}))

mockNuxtImport('useWorkbenchUserStore', () => factories.user)

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

function createProfile(overrides: Partial<Profile> = {}): Profile {
	return {
		discogs_avatar_url: null,
		discogs_uid: null,
		discogs_username: null,
		id: 'listener-user-id',
		just_completed_discogs_oauth: false,
		key_format: 'camelot',
		list_layout: 'grid',
		name: null,
		selected_crate: 'all',
		turntable_pitch_range: 8,
		turntable_theme: 'silver',
		ui_theme: 'light',
		...overrides
	}
}

function createUser(profile: Profile | null = null) {
	return reactive({
		profile,
		supaUser: {
			email: 'listener@example.com',
			user_metadata: { full_name: 'Test Listener' }
		},
		signOut: vi.fn(),
		updateSettings: vi.fn().mockResolvedValue(true)
	})
}

let wrapper: VueWrapper | null = null

describe('settings page', () => {
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		factories.user.mockReset()
		vi.clearAllMocks()
	})

	it('owns a bounded scroll container and exposes project links', async () => {
		factories.user.mockReturnValue(createUser())
		wrapper = await mountSuspended(SettingsPage, {
			global: {
				stubs: {
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
		factories.user.mockReturnValue(user)
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
		user.profile = createProfile({
			turntable_pitch_range: 16,
			turntable_theme: 'black'
		})
		await nextTick()

		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('16')
		expect(user.updateSettings).not.toHaveBeenCalled()

		await wrapper.get('[data-set-value="24"]').trigger('click')
		expect(user.updateSettings).toHaveBeenCalledOnce()
		expect(user.updateSettings).toHaveBeenCalledWith({
			turntable_pitch_range: 24
		})

		user.profile = createProfile({ turntable_pitch_range: 50 })
		await nextTick()
		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('50')
		expect(user.updateSettings).toHaveBeenCalledOnce()
	})

	it('uses the default pitch range while a partial profile is hydrating', async () => {
		const user = createUser({
			id: 'listener-user-id',
			key_format: 'camelot',
			ui_theme: 'light'
		} as Profile)
		factories.user.mockReturnValue(user)
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
		expect(user.updateSettings).not.toHaveBeenCalled()
	})

	it('hydrates turntable finish without writing and persists one user change', async () => {
		const user = createUser()
		factories.user.mockReturnValue(user)
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
		user.profile = createProfile({
			turntable_pitch_range: 16,
			turntable_theme: 'black'
		})
		await nextTick()

		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('black')
		expect(user.updateSettings).not.toHaveBeenCalled()

		await wrapper.get('[data-set-value="silver"]').trigger('click')
		expect(user.updateSettings).toHaveBeenCalledOnce()
		expect(user.updateSettings).toHaveBeenCalledWith({
			turntable_theme: 'silver'
		})

		user.profile = createProfile({ turntable_theme: 'black' })
		await nextTick()
		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('black')
		expect(user.updateSettings).toHaveBeenCalledOnce()
	})

	it('keeps demo pitch and finish changes local', async () => {
		const user = createUser(
			createProfile({ turntable_pitch_range: 16, turntable_theme: 'black' })
		)
		factories.user.mockReturnValue(user)
		wrapper = await mountSuspended(SelectPitchRange, {
			props: { localOnly: true },
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
		await wrapper.get('[data-set-value="24"]').trigger('click')
		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('24')
		wrapper.unmount()

		wrapper = await mountSuspended(SelectorTurntableFinish, {
			props: { localOnly: true },
			global: {
				stubs: {
					RadioGroup: ValueControlStub,
					RadioGroupItem: true
				}
			}
		})
		await wrapper.get('[data-set-value="silver"]').trigger('click')
		expect(
			wrapper.get('[data-testid="value-control"]').attributes('data-value')
		).toBe('silver')
		expect(user.updateSettings).not.toHaveBeenCalled()
	})
})
