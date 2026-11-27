import { describe, expect, it, vi } from 'vitest'
import type { CrateCreateInput, LibraryCrate } from '~~/shared/types/library'
import {
	type PackSetCrateWriter,
	defaultPackSetCrateName,
	describePackSetResult,
	packRecordsIntoCrate
} from './packSet'

function crate(id: string, records: string[] = []): LibraryCrate {
	return {
		id,
		name: `Crate ${id}`,
		description: null,
		color: null,
		records,
		created_at: null,
		updated_at: null
	}
}

/** An in-memory stand-in for the crates store write paths. */
function createWriter(initial: LibraryCrate[] = []) {
	const crates = new Map(initial.map((item) => [item.id, item]))
	const failRecords = new Set<string>()
	const writer = {
		createCrate: vi.fn(
			async (input: CrateCreateInput): Promise<LibraryCrate | null> => {
				const created = { ...crate('new-crate'), ...input }
				crates.set(created.id, created)
				return created
			}
		),
		addRecordToCrate: vi.fn(async (crateId: string, recordId: string) => {
			const current = crates.get(crateId)
			if (!current || failRecords.has(recordId)) return false
			// Idempotent, like the add_record_to_crate RPC.
			if (!current.records.includes(recordId)) {
				crates.set(crateId, {
					...current,
					records: [...current.records, recordId]
				})
			}
			return true
		}),
		getCrateById: vi.fn((id: string) => crates.get(id))
	} satisfies PackSetCrateWriter
	return { writer, crates, failRecords }
}

describe('packRecordsIntoCrate', () => {
	it('creates a crate and adds every record silently, in order', async () => {
		const { writer } = createWriter()

		const result = await packRecordsIntoCrate(writer, ['r1', 'r2'], {
			kind: 'new',
			name: '  Friday  '
		})

		expect(writer.createCrate).toHaveBeenCalledWith({
			name: 'Friday',
			description: null,
			color: null
		})
		expect(writer.addRecordToCrate.mock.calls).toEqual([
			['new-crate', 'r1', { silent: true }],
			['new-crate', 'r2', { silent: true }]
		])
		expect(result).toMatchObject({
			added: 2,
			alreadyPresent: 0,
			failed: 0,
			crate: { id: 'new-crate', records: ['r1', 'r2'] }
		})
	})

	it('adds to an existing crate and counts records it already listed', async () => {
		const { writer } = createWriter([crate('c1', ['r2', 'keep'])])

		const result = await packRecordsIntoCrate(writer, ['r1', 'r2', 'r3'], {
			kind: 'existing',
			crateId: 'c1'
		})

		expect(writer.createCrate).not.toHaveBeenCalled()
		expect(result).toMatchObject({ added: 2, alreadyPresent: 1, failed: 0 })
		expect(result!.crate.records).toEqual(['r2', 'keep', 'r1', 'r3'])
	})

	it('reconciles through the store even when the cached crate lists the record', async () => {
		// Another tab removed r1; this tab's cached crate still lists it. Only
		// the store's idempotent add can restore the persisted membership.
		const persisted = new Set<string>()
		const { writer } = createWriter([crate('c1', ['r1'])])
		writer.addRecordToCrate.mockImplementation(async (_crateId, recordId) => {
			persisted.add(recordId)
			return true
		})

		const result = await packRecordsIntoCrate(writer, ['r1'], {
			kind: 'existing',
			crateId: 'c1'
		})

		expect(writer.addRecordToCrate).toHaveBeenCalledWith('c1', 'r1', {
			silent: true
		})
		expect(persisted.has('r1')).toBe(true)
		expect(result).toMatchObject({ added: 0, alreadyPresent: 1, failed: 0 })
	})

	it('stops and reports nothing once the workspace changes', async () => {
		const { writer } = createWriter([crate('c1')])
		let current = true
		writer.addRecordToCrate.mockImplementationOnce(async () => {
			current = false
			return false
		})

		const result = await packRecordsIntoCrate(
			writer,
			['r1', 'r2', 'r3'],
			{ kind: 'existing', crateId: 'c1' },
			() => current
		)

		expect(result).toBeNull()
		expect(writer.addRecordToCrate).toHaveBeenCalledOnce()
	})

	it('does not start writing into a crate created in a workspace that is gone', async () => {
		const { writer } = createWriter()
		let current = true
		writer.createCrate.mockImplementationOnce(async (input) => {
			current = false
			return { ...crate('new-crate'), ...input }
		})

		const result = await packRecordsIntoCrate(
			writer,
			['r1'],
			{ kind: 'new', name: 'Friday' },
			() => current
		)

		expect(result).toBeNull()
		expect(writer.addRecordToCrate).not.toHaveBeenCalled()
	})

	it('counts failed writes and keeps going', async () => {
		const { writer, failRecords } = createWriter([crate('c1')])
		failRecords.add('r1')

		const result = await packRecordsIntoCrate(writer, ['r1', 'r2'], {
			kind: 'existing',
			crateId: 'c1'
		})

		expect(result).toMatchObject({ added: 1, failed: 1 })
	})

	it('stops when the crate disappears mid-run', async () => {
		const { writer, crates } = createWriter([crate('c1')])
		writer.addRecordToCrate.mockImplementationOnce(async () => {
			crates.delete('c1')
			return false
		})

		const result = await packRecordsIntoCrate(writer, ['r1', 'r2', 'r3'], {
			kind: 'existing',
			crateId: 'c1'
		})

		expect(writer.addRecordToCrate).toHaveBeenCalledOnce()
		expect(result).toMatchObject({ added: 0, failed: 3 })
	})

	it('returns null when the crate cannot be created or found', async () => {
		const { writer } = createWriter()
		writer.createCrate.mockResolvedValueOnce(null)

		expect(
			await packRecordsIntoCrate(writer, ['r1'], { kind: 'new', name: 'X' })
		).toBeNull()
		expect(
			await packRecordsIntoCrate(writer, ['r1'], {
				kind: 'existing',
				crateId: 'missing'
			})
		).toBeNull()
		expect(
			await packRecordsIntoCrate(writer, ['r1'], { kind: 'new', name: '   ' })
		).toBeNull()
		expect(writer.addRecordToCrate).not.toHaveBeenCalled()
	})

	it('clamps a long crate name to the crate name limit', async () => {
		const { writer } = createWriter()

		await packRecordsIntoCrate(writer, [], {
			kind: 'new',
			name: 'x'.repeat(80)
		})

		expect(writer.createCrate.mock.calls[0]![0].name).toHaveLength(50)
	})
})

describe('pack set copy', () => {
	it('summarises the outcome', () => {
		expect(
			describePackSetResult({
				crate: crate('c1'),
				added: 1,
				alreadyPresent: 2,
				failed: 1
			})
		).toBe('Crate c1: 1 record added, 2 already there, 1 failed.')
		expect(
			describePackSetResult({
				crate: crate('c1'),
				added: 3,
				alreadyPresent: 0,
				failed: 0
			})
		).toBe('Crate c1: 3 records added.')
	})

	it('names a new crate after the set, or the date', () => {
		const date = new Date(2026, 10, 25)

		expect(defaultPackSetCrateName(' Friday ', date)).toBe('Friday')
		expect(defaultPackSetCrateName(null, date)).toBe('Set 2026-11-25')
		expect(defaultPackSetCrateName('y'.repeat(60), date)).toHaveLength(50)
	})
})
