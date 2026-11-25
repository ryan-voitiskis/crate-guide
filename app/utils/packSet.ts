import type { CrateCreateInput, LibraryCrate } from '~~/shared/types/library'

export const PACK_SET_CRATE_NAME_MAX = 50

export type PackSetTarget =
	{ kind: 'new'; name: string } | { kind: 'existing'; crateId: string }

export interface PackSetResult {
	crate: LibraryCrate
	added: number
	alreadyPresent: number
	failed: number
}

/** The crate store write paths that packing uses. */
export interface PackSetCrateWriter {
	createCrate(input: CrateCreateInput): Promise<LibraryCrate | null>
	addRecordToCrate(
		crateId: string,
		recordId: string,
		options?: { silent?: boolean }
	): Promise<boolean>
	getCrateById(id: string): LibraryCrate | undefined
}

/**
 * Add every record to the target crate through the store's own write paths.
 *
 * Every record goes through `addRecordToCrate`, even one the cached crate
 * already lists: the membership RPC is idempotent and returns the persisted
 * crate, so a record another tab removed is restored instead of being
 * reported as present from stale local state. Nothing is ever removed.
 *
 * Writes run one at a time so each uses the store's version and lifecycle
 * checks. A crate that disappears mid-run (deleted elsewhere) stops the run
 * and the remaining records count as failed. When `isCurrent` turns false
 * (sign-out, account or workspace switch) the run stops and returns null, so
 * no result from the old workspace is reported in the new one.
 */
export async function packRecordsIntoCrate(
	crates: PackSetCrateWriter,
	recordIds: readonly string[],
	target: PackSetTarget,
	isCurrent: () => boolean = () => true
): Promise<PackSetResult | null> {
	let crate: LibraryCrate | null | undefined
	if (target.kind === 'new') {
		const name = target.name.trim().slice(0, PACK_SET_CRATE_NAME_MAX).trim()
		if (!name) return null
		crate = await crates.createCrate({ name, description: null, color: null })
	} else {
		crate = crates.getCrateById(target.crateId)
	}
	if (!crate || !isCurrent()) return null

	const crateId = crate.id
	const result: PackSetResult = {
		crate,
		added: 0,
		alreadyPresent: 0,
		failed: 0
	}
	for (const [index, recordId] of recordIds.entries()) {
		if (!isCurrent()) return null
		const current = crates.getCrateById(crateId)
		if (!current) {
			result.failed += recordIds.length - index
			break
		}
		result.crate = current
		const listedBefore = current.records.includes(recordId)
		const added = await crates.addRecordToCrate(crateId, recordId, {
			silent: true
		})
		if (!isCurrent()) return null
		if (!added) result.failed += 1
		else if (listedBefore) result.alreadyPresent += 1
		else result.added += 1
	}
	result.crate = crates.getCrateById(crateId) ?? result.crate
	return result
}

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function describePackSetResult(result: PackSetResult): string {
	const parts = [`${plural(result.added, 'record')} added`]
	if (result.alreadyPresent > 0) {
		parts.push(`${result.alreadyPresent} already there`)
	}
	if (result.failed > 0) parts.push(`${result.failed} failed`)
	return `${result.crate.name}: ${parts.join(', ')}.`
}

function formatLocalDate(date: Date): string {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-')
}

export function defaultPackSetCrateName(
	setName: string | null | undefined,
	date: Date
): string {
	const trimmed = setName?.trim()
	return (trimmed || `Set ${formatLocalDate(date)}`).slice(
		0,
		PACK_SET_CRATE_NAME_MAX
	)
}
