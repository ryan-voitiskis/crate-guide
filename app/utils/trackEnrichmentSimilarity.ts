import { canBeFuzzyTitleMatch } from './trackEnrichmentIndex'

export type StringSetComparison = {
	accepted: boolean
	exact: boolean
	similarity: number
}

export function calculateLevenshteinDistance(
	left: string,
	right: string
): number {
	if (left === right) return 0
	if (left.length === 0) return right.length
	if (right.length === 0) return left.length

	let previous = Array.from({ length: right.length + 1 }, (_, index) => index)

	for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
		const current = [leftIndex]

		for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
			const substitutionCost =
				left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
			current[rightIndex] = Math.min(
				(current[rightIndex - 1] ?? 0) + 1,
				(previous[rightIndex] ?? 0) + 1,
				(previous[rightIndex - 1] ?? 0) + substitutionCost
			)
		}

		previous = current
	}

	return previous[right.length] ?? Math.max(left.length, right.length)
}

function minimumSimilarity(left: string, right: string): number {
	const shortestLength = Math.min(left.length, right.length)
	if (shortestLength <= 4) return 1
	if (shortestLength <= 7) return 0.88
	return 0.84
}

export function compareEnrichmentStringSets(
	left: readonly string[],
	right: readonly string[]
): StringSetComparison {
	let bestSimilarity = 0
	let bestAcceptedSimilarity = 0
	let accepted = false

	for (const leftValue of left) {
		for (const rightValue of right) {
			if (leftValue === rightValue) {
				return { accepted: true, exact: true, similarity: 1 }
			}

			if (!canBeFuzzyTitleMatch(leftValue, rightValue)) continue

			const longestLength = Math.max(leftValue.length, rightValue.length)
			const similarity =
				1 - calculateLevenshteinDistance(leftValue, rightValue) / longestLength
			bestSimilarity = Math.max(bestSimilarity, similarity)

			if (similarity >= minimumSimilarity(leftValue, rightValue)) {
				bestAcceptedSimilarity = Math.max(bestAcceptedSimilarity, similarity)
				accepted = true
			}
		}
	}

	return {
		accepted,
		exact: false,
		similarity: accepted ? bestAcceptedSimilarity : bestSimilarity
	}
}
