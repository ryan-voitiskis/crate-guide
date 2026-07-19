import { describe, expect, it } from 'vitest'
import {
	compareCreatedAtDescIdDesc,
	postgresTimestampMicroseconds,
	sortCreatedAtDescIdDesc
} from './supabaseOrdering'

describe('postgresTimestampMicroseconds', () => {
	it('preserves adjacent microseconds', () => {
		const earlier = postgresTimestampMicroseconds('2026-07-19T04:00:00.123456Z')
		const later = postgresTimestampMicroseconds('2026-07-19T04:00:00.123457Z')

		expect(earlier).not.toBeNull()
		expect(later! - earlier!).toBe(1n)
	})

	it('normalizes equivalent timezone offsets without Date.parse', () => {
		expect(
			postgresTimestampMicroseconds('2026-07-19T14:00:00.123456+10:00')
		).toBe(postgresTimestampMicroseconds('2026-07-18 20:00:00.123456-08:00'))
	})

	it.each([
		'not-a-timestamp',
		'2026-02-30T04:00:00Z',
		'2025-02-29T04:00:00Z',
		'2026-07-19T24:00:00Z',
		'2026-07-19T04:00:00+14:01',
		'2026-07-19T04:00:00.1234567Z'
	])('rejects invalid PostgreSQL timestamp %s', (value) => {
		expect(postgresTimestampMicroseconds(value)).toBeNull()
	})
})

describe('compareCreatedAtDescIdDesc', () => {
	it('sorts newest instants first with descending ID ties', () => {
		const rows = [
			{ id: 'id-a', created_at: '2026-07-19T04:00:00.123456Z' },
			{ id: 'id-z', created_at: '2026-07-19T14:00:00.123456+10:00' },
			{ id: 'id-m', created_at: '2026-07-19T04:00:00.123457Z' }
		]

		expect(sortCreatedAtDescIdDesc(rows).map(({ id }) => id)).toEqual([
			'id-m',
			'id-z',
			'id-a'
		])
	})

	it('places invalid and null timestamps in one final descending-ID bucket', () => {
		const rows = [
			{ id: 'id-a', created_at: null },
			{ id: 'id-z', created_at: 'invalid' },
			{ id: 'id-m', created_at: '2026-07-19T04:00:00Z' }
		]

		expect(sortCreatedAtDescIdDesc(rows).map(({ id }) => id)).toEqual([
			'id-m',
			'id-z',
			'id-a'
		])
	})

	it('returns an exact tie only for equal IDs in the same timestamp bucket', () => {
		const row = { id: 'same-id', created_at: null }

		expect(compareCreatedAtDescIdDesc(row, { ...row })).toBe(0)
	})
})
