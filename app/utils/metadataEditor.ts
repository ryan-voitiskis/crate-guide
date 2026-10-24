import type {
	CrateMetadataUpdate,
	LibraryCrate,
	LibraryRecord,
	RecordUpdateInput
} from '~~/shared/types/library'

export function recordEditorPayload(record: LibraryRecord) {
	return {
		title: record.title,
		year: record.year,
		artists: record.artists.map((artist) => ({ ...artist })),
		cover: { ...record.cover }
	}
}

export function recordEditorBaseline(record: LibraryRecord) {
	return {
		id: record.id,
		expectedUpdatedAt: record.updated_at,
		payload: recordEditorPayload(record)
	}
}

export function crateEditorPayload(crate: LibraryCrate) {
	return {
		name: crate.name,
		description: crate.description,
		color: crate.color
	}
}

export function crateEditorBaseline(crate: LibraryCrate) {
	return {
		id: crate.id,
		expectedUpdatedAt: crate.updated_at,
		payload: crateEditorPayload(crate)
	}
}

export function recordEditorPatch(
	baseline: ReturnType<typeof recordEditorPayload>,
	current: ReturnType<typeof recordEditorPayload>
): RecordUpdateInput {
	return metadataPatch(baseline, current)
}

export function crateEditorPatch(
	baseline: ReturnType<typeof crateEditorPayload>,
	current: ReturnType<typeof crateEditorPayload>
): CrateMetadataUpdate {
	return metadataPatch(baseline, current)
}

function metadataPatch<T extends object>(baseline: T, current: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(current).filter(
			([key, value]) =>
				JSON.stringify(value) !== JSON.stringify(baseline[key as keyof T])
		)
	) as Partial<T>
}

export function recordEditorChanges(
	before: ReturnType<typeof recordEditorPayload>,
	latest: ReturnType<typeof recordEditorPayload>
) {
	const patch = recordEditorPatch(before, latest)
	const changes = []
	if (patch.title !== undefined)
		changes.push({ label: 'Title', value: latest.title })
	if (patch.year !== undefined)
		changes.push({
			label: 'Year',
			value: latest.year?.toString() ?? 'Not specified'
		})
	if (patch.artists !== undefined)
		changes.push({
			label: 'Artists',
			value:
				latest.artists.map((artist) => artist.name).join(', ') ||
				'Not specified'
		})
	if (patch.cover !== undefined)
		changes.push({
			label: 'Cover',
			value:
				latest.cover.kind === 'none'
					? 'No cover'
					: latest.cover.kind === 'external'
						? latest.cover.url
						: 'Uploaded cover'
		})
	return changes
}

export function crateEditorChanges(
	before: ReturnType<typeof crateEditorPayload>,
	latest: ReturnType<typeof crateEditorPayload>
) {
	const labels = { name: 'Name', description: 'Description', color: 'Color' }
	return Object.entries(crateEditorPatch(before, latest)).map(
		([key, value]) => ({
			label: labels[key as keyof typeof labels],
			value: value || 'Not specified'
		})
	)
}
