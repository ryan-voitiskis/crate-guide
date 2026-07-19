export const TITLE_MINIMUM_LENGTH_DIFFERENCE = 2
export const TITLE_LENGTH_DIFFERENCE_RATIO = 0.2
export const TITLE_FIRST_CHARACTER_REQUIRED_LENGTH = 6

export function isTitleLengthAdmissible(
	leftLength: number,
	rightLength: number
): boolean {
	const longestLength = Math.max(leftLength, rightLength)
	const allowedLengthDifference = Math.max(
		TITLE_MINIMUM_LENGTH_DIFFERENCE,
		Math.ceil(longestLength * TITLE_LENGTH_DIFFERENCE_RATIO)
	)

	return Math.abs(leftLength - rightLength) <= allowedLengthDifference
}

export function canBeFuzzyTitleMatch(left: string, right: string): boolean {
	const longestLength = Math.max(left.length, right.length)

	if (!isTitleLengthAdmissible(left.length, right.length)) return false
	if (
		longestLength >= TITLE_FIRST_CHARACTER_REQUIRED_LENGTH &&
		left[0] !== right[0]
	) {
		return false
	}
	return true
}

export type TrackEnrichmentIndexCandidate<T> = {
	identity: string
	titles: readonly string[]
	value: T
}

export type TrackEnrichmentTitleIndex<T> = {
	candidates: readonly TrackEnrichmentIndexCandidate<T>[]
	exactTitleBuckets: ReadonlyMap<string, readonly string[]>
	longTitleBuckets: ReadonlyMap<string, ReadonlyMap<number, readonly string[]>>
	shortTitleBuckets: ReadonlyMap<number, readonly string[]>
	candidateOrder: ReadonlyMap<string, number>
	candidatesByIdentity: ReadonlyMap<string, T>
	canShortlist: boolean
}

function appendToBucket<K>(
	buckets: Map<K, string[]>,
	key: K,
	identity: string
) {
	const bucket = buckets.get(key) ?? []
	bucket.push(identity)
	buckets.set(key, bucket)
}

export function createTrackEnrichmentTitleIndex<T>(
	candidates: readonly TrackEnrichmentIndexCandidate<T>[]
): TrackEnrichmentTitleIndex<T> {
	const exactTitleBuckets = new Map<string, string[]>()
	const longTitleBuckets = new Map<string, Map<number, string[]>>()
	const shortTitleBuckets = new Map<number, string[]>()
	const candidateOrder = new Map<string, number>()
	const candidatesByIdentity = new Map<string, T>()
	let canShortlist = true

	for (const [candidateIndex, candidate] of candidates.entries()) {
		if (!candidate.identity || candidateOrder.has(candidate.identity)) {
			canShortlist = false
		} else {
			candidateOrder.set(candidate.identity, candidateIndex)
			candidatesByIdentity.set(candidate.identity, candidate.value)
		}

		for (const title of new Set(candidate.titles.filter(Boolean))) {
			appendToBucket(exactTitleBuckets, title, candidate.identity)

			if (title.length < TITLE_FIRST_CHARACTER_REQUIRED_LENGTH) {
				appendToBucket(shortTitleBuckets, title.length, candidate.identity)
				continue
			}

			const firstCharacter = title[0]
			if (!firstCharacter) {
				canShortlist = false
				continue
			}
			const lengthBuckets = longTitleBuckets.get(firstCharacter) ?? new Map()
			appendToBucket(lengthBuckets, title.length, candidate.identity)
			longTitleBuckets.set(firstCharacter, lengthBuckets)
		}
	}

	return {
		candidates,
		exactTitleBuckets,
		longTitleBuckets,
		shortTitleBuckets,
		candidateOrder,
		candidatesByIdentity,
		canShortlist
	}
}

function addIdentities(
	identities: Set<string>,
	bucket: readonly string[] | undefined
) {
	if (!bucket) return
	for (const identity of bucket) identities.add(identity)
}

export function getCandidateShortlist<T>(
	index: TrackEnrichmentTitleIndex<T>,
	sourceTitles: readonly string[]
): T[] {
	const usableSourceTitles = Array.from(new Set(sourceTitles.filter(Boolean)))
	if (!index.canShortlist || usableSourceTitles.length === 0) {
		return index.candidates.map((candidate) => candidate.value)
	}

	const selectedIdentities = new Set<string>()

	for (const sourceTitle of usableSourceTitles) {
		addIdentities(selectedIdentities, index.exactTitleBuckets.get(sourceTitle))

		// Short titles do not require a shared first character. Including every
		// length-admissible short bucket is necessary for fuzzy-match completeness.
		for (const [candidateLength, identities] of index.shortTitleBuckets) {
			if (isTitleLengthAdmissible(sourceTitle.length, candidateLength)) {
				addIdentities(selectedIdentities, identities)
			}
		}

		const firstCharacter = sourceTitle[0]
		if (!firstCharacter) {
			return index.candidates.map((candidate) => candidate.value)
		}
		const longLengthBuckets = index.longTitleBuckets.get(firstCharacter)
		if (!longLengthBuckets) continue

		for (const [candidateLength, identities] of longLengthBuckets) {
			if (isTitleLengthAdmissible(sourceTitle.length, candidateLength)) {
				addIdentities(selectedIdentities, identities)
			}
		}
	}

	const orderedIdentities = [...selectedIdentities].sort(
		(left, right) =>
			(index.candidateOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
			(index.candidateOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
	)
	return orderedIdentities.flatMap((identity) => {
		const candidate = index.candidatesByIdentity.get(identity)
		return candidate === undefined ? [] : [candidate]
	})
}
