import { nextTick, reactive } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import LayoutLegalDocument from '~/components/legal/LayoutLegalDocument.vue'
import LegalLayout from '~/layouts/legal.vue'

const route = reactive({ path: '/privacy' })
mockNuxtImport('useRoute', () => () => route)

describe('legal document layout', () => {
	it('returns to the main Crate Guide route from the brand link', async () => {
		const wrapper = await mountSuspended(LayoutLegalDocument, {
			props: {
				title: 'Privacy Notice',
				summary: 'How Crate Guide handles data.',
				effectiveDate: '18 July 2026'
			},
			slots: { default: '<p>Legal document content</p>' }
		})

		const returnLink = wrapper.get('a[aria-label="Back to Crate Guide"]')
		expect(returnLink.attributes('href')).toBe('/')
		expect(returnLink.findAll('span').at(-1)?.text()).toBe(
			'Back to Crate Guide'
		)
		expect(returnLink.find('.lucide-arrow-left').exists()).toBe(true)
	})

	it('returns document navigation to the top of the legal shell', async () => {
		route.path = '/privacy'
		const wrapper = await mountSuspended(LegalLayout, {
			slots: { default: '<div>Legal document</div>' }
		})
		const scrollShell = wrapper.get('[data-legal-page-scroll-container]')
		scrollShell.element.scrollTop = 480
		scrollShell.element.scrollLeft = 24

		route.path = '/terms'
		await nextTick()
		await nextTick()

		expect(scrollShell.element.scrollTop).toBe(0)
		expect(scrollShell.element.scrollLeft).toBe(0)
	})
})
