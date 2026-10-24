import { createMockLibraryRecord } from 'test/mocks/fixtures/records'
import { describe, expect, it } from 'vitest'
import type { LibraryCrate } from '~~/shared/types/library'
import {
	crateEditorBaseline,
	crateEditorChanges,
	crateEditorPatch,
	recordEditorBaseline,
	recordEditorChanges,
	recordEditorPatch
} from './metadataEditor'

describe('metadata editor baselines', () => {
	it('preserves timestamp precision and owns its editable arrays and cover reference', () => {
		const record = createMockLibraryRecord({
			updated_at: '2026-10-24T04:00:00.000123Z',
			artists: [{ name: 'Original artist', role: null }],
			cover: { kind: 'external', url: 'https://example.invalid/original.jpg' }
		})
		const baseline = recordEditorBaseline(record)
		expect(baseline.expectedUpdatedAt).toBe('2026-10-24T04:00:00.000123Z')
		record.artists[0]!.name = 'Remote artist'
		record.cover = { kind: 'none' }
		expect(baseline.payload.artists[0]!.name).toBe('Original artist')
		expect(baseline.payload.cover.kind).toBe('external')
	})
	it('rebases only deliberate record edits and reports a changed managed cover', () => {
		const baseline = recordEditorBaseline(
			createMockLibraryRecord({
				title: 'Original',
				year: 2000,
				cover: { kind: 'cloud', assetId: 'old', fallbackUrl: null }
			})
		)
		const latest = {
			...baseline.payload,
			year: 2001,
			cover: { kind: 'cloud' as const, assetId: 'new', fallbackUrl: null }
		}
		const edits = recordEditorPatch(baseline.payload, {
			...baseline.payload,
			title: 'My title'
		})
		expect(edits).toEqual({ title: 'My title' })
		expect({ ...latest, ...edits }).toMatchObject({
			title: 'My title',
			year: 2001,
			cover: { assetId: 'new' }
		})
		expect(recordEditorChanges(baseline.payload, latest)).toEqual([
			{ label: 'Year', value: '2001' },
			{ label: 'Cover', value: 'Uploaded cover' }
		])
	})
	it('keeps crate metadata edits independent from membership and newer unedited fields', () => {
		const crate: LibraryCrate = {
			id: 'crate',
			name: 'Original',
			description: null,
			color: null,
			records: ['record-a'],
			created_at: null,
			updated_at: null
		}
		const baseline = crateEditorBaseline(crate)
		const latest = crateEditorBaseline({
			...crate,
			description: 'Remote notes',
			records: ['record-a', 'record-b']
		})
		const edits = crateEditorPatch(baseline.payload, {
			...baseline.payload,
			name: 'My name'
		})
		expect(edits).toEqual({ name: 'My name' })
		expect({ ...latest.payload, ...edits }).toEqual({
			name: 'My name',
			description: 'Remote notes',
			color: null
		})
		expect(crateEditorChanges(baseline.payload, latest.payload)).toEqual([
			{ label: 'Description', value: 'Remote notes' }
		])
	})
})
