export const NEVER_EXPORTED_REMINDER_AGE_MS = 24 * 60 * 60 * 1000
export const NEVER_EXPORTED_REMINDER_REVISION_COUNT = 25
export const EXPORTED_REMINDER_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const EXPORTED_REMINDER_REVISION_COUNT = 100

type BackupReminderTrigger = 'age' | 'content-revisions'
type NonEmptyBackupReminderTriggers = readonly [
	BackupReminderTrigger,
	...BackupReminderTrigger[]
]

export type LocalBackupReminderInput = Readonly<{
	hasContent: boolean
	nowMs: number
	contentRevision: number
	firstContentWriteAtMs: number | null
	lastExport: Readonly<{
		createdAtMs: number
		contentRevision: number
	}> | null
}>

export type LocalBackupReminderDecision =
	| Readonly<{
			status: 'not-applicable'
			reason: 'empty-library'
	  }>
	| Readonly<{
			status: 'indeterminate'
			reason:
				| 'invalid-input'
				| 'invalid-clock'
				| 'invalid-content-revision'
				| 'missing-first-content-time'
				| 'future-first-content-time'
				| 'invalid-export-marker'
				| 'future-export-time'
				| 'export-revision-ahead'
	  }>
	| Readonly<{
			status: 'not-due'
			mode: 'never-exported'
			ageMs: number
			contentRevisions: number
	  }>
	| Readonly<{
			status: 'not-due'
			mode: 'exported'
			ageMs: number
			changesSinceExport: number
	  }>
	| Readonly<{
			status: 'due'
			mode: 'never-exported'
			triggers: NonEmptyBackupReminderTriggers
			ageMs: number
			contentRevisions: number
	  }>
	| Readonly<{
			status: 'due'
			mode: 'exported'
			triggers: NonEmptyBackupReminderTriggers
			ageMs: number
			changesSinceExport: number
	  }>

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isTimestamp(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isRevision(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function indeterminate(
	reason: Extract<
		LocalBackupReminderDecision,
		{ status: 'indeterminate' }
	>['reason']
): LocalBackupReminderDecision {
	return { status: 'indeterminate', reason }
}

function toNonEmptyTriggers(
	triggers: readonly BackupReminderTrigger[]
): NonEmptyBackupReminderTriggers | null {
	const first = triggers[0]
	return first === undefined ? null : [first, ...triggers.slice(1)]
}

/**
 * Determine reminder eligibility from already-committed revision/timestamp
 * metadata. This function does not dismiss, persist, export, or schedule work.
 */
export function decideLocalBackupReminder(
	input: LocalBackupReminderInput
): LocalBackupReminderDecision {
	if (!isRecord(input) || typeof input.hasContent !== 'boolean') {
		return indeterminate('invalid-input')
	}
	if (!isTimestamp(input.nowMs)) return indeterminate('invalid-clock')
	if (!isRevision(input.contentRevision)) {
		return indeterminate('invalid-content-revision')
	}
	if (!input.hasContent)
		return { status: 'not-applicable', reason: 'empty-library' }

	if (input.lastExport === null) {
		if (input.contentRevision < 1) {
			return indeterminate('invalid-content-revision')
		}
		if (!isTimestamp(input.firstContentWriteAtMs)) {
			return indeterminate('missing-first-content-time')
		}
		if (input.firstContentWriteAtMs > input.nowMs) {
			return indeterminate('future-first-content-time')
		}

		const ageMs = input.nowMs - input.firstContentWriteAtMs
		const triggers: BackupReminderTrigger[] = []
		if (ageMs >= NEVER_EXPORTED_REMINDER_AGE_MS) triggers.push('age')
		if (input.contentRevision >= NEVER_EXPORTED_REMINDER_REVISION_COUNT) {
			triggers.push('content-revisions')
		}
		const dueTriggers = toNonEmptyTriggers(triggers)
		if (!dueTriggers) {
			return {
				status: 'not-due',
				mode: 'never-exported',
				ageMs,
				contentRevisions: input.contentRevision
			}
		}
		return {
			status: 'due',
			mode: 'never-exported',
			triggers: dueTriggers,
			ageMs,
			contentRevisions: input.contentRevision
		}
	}

	if (
		!isRecord(input.lastExport) ||
		!isTimestamp(input.lastExport.createdAtMs) ||
		!isRevision(input.lastExport.contentRevision)
	) {
		return indeterminate('invalid-export-marker')
	}
	if (input.lastExport.createdAtMs > input.nowMs) {
		return indeterminate('future-export-time')
	}
	if (input.lastExport.contentRevision > input.contentRevision) {
		return indeterminate('export-revision-ahead')
	}

	const ageMs = input.nowMs - input.lastExport.createdAtMs
	const changesSinceExport =
		input.contentRevision - input.lastExport.contentRevision
	const triggers: BackupReminderTrigger[] = []
	if (changesSinceExport >= 1 && ageMs >= EXPORTED_REMINDER_AGE_MS) {
		triggers.push('age')
	}
	if (changesSinceExport >= EXPORTED_REMINDER_REVISION_COUNT) {
		triggers.push('content-revisions')
	}
	const dueTriggers = toNonEmptyTriggers(triggers)
	if (!dueTriggers) {
		return {
			status: 'not-due',
			mode: 'exported',
			ageMs,
			changesSinceExport
		}
	}
	return {
		status: 'due',
		mode: 'exported',
		triggers: dueTriggers,
		ageMs,
		changesSinceExport
	}
}
