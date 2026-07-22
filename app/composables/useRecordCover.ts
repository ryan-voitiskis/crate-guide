import type { CoverReference, LibraryRecord } from '~~/shared/types/library'

export function getCoverFallbackUrl(reference: CoverReference): string | null {
	if (reference.kind === 'external') return reference.url
	if (reference.kind === 'cloud' || reference.kind === 'browser') {
		return reference.fallbackUrl
	}
	return null
}

export function getCoverReferenceKey(reference: CoverReference): string {
	switch (reference.kind) {
		case 'none':
			return 'none'
		case 'external':
			return `external:${reference.url}`
		case 'cloud':
		case 'browser':
			return `${reference.kind}:${reference.assetId}:${reference.fallbackUrl ?? ''}`
	}
}

export function hasRecordCover(reference: CoverReference): boolean {
	return reference.kind !== 'none'
}

export function isManagedRecordCover(reference: CoverReference): boolean {
	return reference.kind === 'cloud' || reference.kind === 'browser'
}

export function useRecordCover() {
	const runtime = useWorkbenchRuntime()

	async function getCoverUrl(
		record: Pick<LibraryRecord, 'cover'>
	): Promise<string | null> {
		const captured = runtime.capture()
		try {
			const resolved = await captured.repositories.covers.resolve(
				captured.context,
				record.cover
			)
			return runtime.isCurrent(captured.context) ? resolved : null
		} catch {
			return runtime.isCurrent(captured.context)
				? getCoverFallbackUrl(record.cover)
				: null
		}
	}

	return { getCoverUrl }
}
