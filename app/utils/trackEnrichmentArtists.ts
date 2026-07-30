import { compareEnrichmentStringSets } from './trackEnrichmentSimilarity'
import type { ArtistComparison, ArtistMetadata } from './trackEnrichmentTypes'

function hasContainedArtistName(left: string[], right: string[]): boolean {
	return left.some((leftValue) =>
		right.some((rightValue) => {
			const [shorter, longer] =
				leftValue.length <= rightValue.length
					? [leftValue, rightValue]
					: [rightValue, leftValue]
			return shorter.length >= 4 && longer.includes(shorter)
		})
	)
}

export function compareArtistMetadata(
	source: ArtistMetadata,
	candidate: ArtistMetadata
): ArtistComparison {
	if (source.fullNames.length === 0 || candidate.fullNames.length === 0) {
		return { kind: 'none', similarity: 0 }
	}

	const fullMatch = compareEnrichmentStringSets(
		source.fullNames,
		candidate.fullNames
	)
	if (fullMatch.exact) return { kind: 'exact', similarity: 1 }
	if (fullMatch.accepted) {
		return { kind: 'fuzzy', similarity: fullMatch.similarity }
	}

	const componentMatch = compareEnrichmentStringSets(
		source.allNames,
		candidate.allNames
	)
	if (
		componentMatch.accepted ||
		hasContainedArtistName(source.fullNames, candidate.fullNames)
	) {
		return { kind: 'partial', similarity: componentMatch.similarity }
	}

	return { kind: 'none', similarity: 0 }
}
