import { describe, expect, it } from 'vitest'
import type { LocalBackupReminderInput } from './localBackupReminderPolicy'
import {
	EXPORTED_REMINDER_AGE_MS,
	EXPORTED_REMINDER_REVISION_COUNT,
	NEVER_EXPORTED_REMINDER_AGE_MS,
	NEVER_EXPORTED_REMINDER_REVISION_COUNT,
	decideLocalBackupReminder
} from './localBackupReminderPolicy'

const nowMs = 10_000_000_000

function input(
	overrides: Partial<LocalBackupReminderInput> = {}
): LocalBackupReminderInput {
	return {
		hasContent: true,
		nowMs,
		contentRevision: 1,
		firstContentWriteAtMs: nowMs,
		lastExport: null,
		...overrides
	}
}

describe('Local backup reminder policy', () => {
	it('never reminds for an empty library', () => {
		expect(
			decideLocalBackupReminder(
				input({
					hasContent: false,
					contentRevision: 999,
					firstContentWriteAtMs: null
				})
			)
		).toEqual({ status: 'not-applicable', reason: 'empty-library' })
	})

	const neverExportedAgeCases = [
		{ label: 'just before', ageMs: NEVER_EXPORTED_REMINDER_AGE_MS - 1 },
		{ label: 'exactly at', ageMs: NEVER_EXPORTED_REMINDER_AGE_MS },
		{ label: 'just after', ageMs: NEVER_EXPORTED_REMINDER_AGE_MS + 1 }
	] as const
	const neverExportedRevisionCases = [
		{
			label: 'one before',
			contentRevision: NEVER_EXPORTED_REMINDER_REVISION_COUNT - 1
		},
		{
			label: 'exactly at',
			contentRevision: NEVER_EXPORTED_REMINDER_REVISION_COUNT
		},
		{
			label: 'one after',
			contentRevision: NEVER_EXPORTED_REMINDER_REVISION_COUNT + 1
		}
	] as const

	for (const ageCase of neverExportedAgeCases) {
		for (const revisionCase of neverExportedRevisionCases) {
			it(`evaluates never-exported age ${ageCase.label} and revisions ${revisionCase.label}`, () => {
				const result = decideLocalBackupReminder(
					input({
						contentRevision: revisionCase.contentRevision,
						firstContentWriteAtMs: nowMs - ageCase.ageMs
					})
				)
				const ageDue = ageCase.ageMs >= NEVER_EXPORTED_REMINDER_AGE_MS
				const revisionDue =
					revisionCase.contentRevision >= NEVER_EXPORTED_REMINDER_REVISION_COUNT
				expect(result.status).toBe(ageDue || revisionDue ? 'due' : 'not-due')
				if (result.status === 'due') {
					expect(result.triggers).toEqual([
						...(ageDue ? (['age'] as const) : []),
						...(revisionDue ? (['content-revisions'] as const) : [])
					])
				}
			})
		}
	}

	it('does not use elapsed export age without at least one later change', () => {
		expect(
			decideLocalBackupReminder(
				input({
					contentRevision: 42,
					lastExport: {
						contentRevision: 42,
						createdAtMs: nowMs - EXPORTED_REMINDER_AGE_MS - 1
					}
				})
			)
		).toMatchObject({
			status: 'not-due',
			mode: 'exported',
			changesSinceExport: 0
		})
	})

	const exportedAgeCases = [
		{ label: 'just before', ageMs: EXPORTED_REMINDER_AGE_MS - 1 },
		{ label: 'exactly at', ageMs: EXPORTED_REMINDER_AGE_MS },
		{ label: 'just after', ageMs: EXPORTED_REMINDER_AGE_MS + 1 }
	] as const
	const exportedChangeCases = [
		{ label: 'first change', changes: 1 },
		{
			label: 'one before revision threshold',
			changes: EXPORTED_REMINDER_REVISION_COUNT - 1
		},
		{
			label: 'exactly at revision threshold',
			changes: EXPORTED_REMINDER_REVISION_COUNT
		},
		{
			label: 'one after revision threshold',
			changes: EXPORTED_REMINDER_REVISION_COUNT + 1
		}
	] as const

	for (const ageCase of exportedAgeCases) {
		for (const changeCase of exportedChangeCases) {
			it(`evaluates exported age ${ageCase.label} and ${changeCase.label}`, () => {
				const exportedRevision = 10
				const result = decideLocalBackupReminder(
					input({
						contentRevision: exportedRevision + changeCase.changes,
						lastExport: {
							contentRevision: exportedRevision,
							createdAtMs: nowMs - ageCase.ageMs
						}
					})
				)
				const ageDue = ageCase.ageMs >= EXPORTED_REMINDER_AGE_MS
				const revisionDue =
					changeCase.changes >= EXPORTED_REMINDER_REVISION_COUNT
				expect(result.status).toBe(ageDue || revisionDue ? 'due' : 'not-due')
				if (result.status === 'due') {
					expect(result.triggers).toEqual([
						...(ageDue ? (['age'] as const) : []),
						...(revisionDue ? (['content-revisions'] as const) : [])
					])
				}
			})
		}
	}

	it.each([
		{
			label: 'invalid clock',
			value: input({ nowMs: Number.NaN }),
			reason: 'invalid-clock'
		},
		{
			label: 'invalid revision',
			value: input({ contentRevision: -1 }),
			reason: 'invalid-content-revision'
		},
		{
			label: 'missing first-write time',
			value: input({ firstContentWriteAtMs: null }),
			reason: 'missing-first-content-time'
		},
		{
			label: 'future first-write time',
			value: input({ firstContentWriteAtMs: nowMs + 1 }),
			reason: 'future-first-content-time'
		},
		{
			label: 'invalid export marker',
			value: input({
				lastExport: { createdAtMs: Number.NaN, contentRevision: 1 }
			}),
			reason: 'invalid-export-marker'
		},
		{
			label: 'future export time',
			value: input({
				lastExport: { createdAtMs: nowMs + 1, contentRevision: 1 }
			}),
			reason: 'future-export-time'
		},
		{
			label: 'export revision ahead',
			value: input({
				contentRevision: 1,
				lastExport: { createdAtMs: nowMs, contentRevision: 2 }
			}),
			reason: 'export-revision-ahead'
		}
	] as const)('fails closed for $label', ({ reason, value }) => {
		expect(decideLocalBackupReminder(value)).toEqual({
			status: 'indeterminate',
			reason
		})
	})
})
