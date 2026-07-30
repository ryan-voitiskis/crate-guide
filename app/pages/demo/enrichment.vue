<script setup lang="ts">
import PageTrackEnrichment from '~/components/enrichment/PageTrackEnrichment.vue'
import type { ReviewFilter } from '~/composables/useTrackEnrichmentWorkflow'
import { createDemoEnrichmentReview } from '~/demo/enrichmentFixtures'

definePageMeta({ layout: 'demo' })

const route = useRoute()
const reviewFilters: ReviewFilter[] = [
	'ready',
	'review',
	'staged',
	'matched',
	'unmatched',
	'done'
]

const initialReview = computed(() => {
	if (route.query.state !== 'review') return null
	const requestedFilter = route.query.filter
	const selectedFilter = reviewFilters.includes(requestedFilter as ReviewFilter)
		? (requestedFilter as ReviewFilter)
		: 'ready'
	return createDemoEnrichmentReview(selectedFilter)
})
</script>

<template>
	<PageTrackEnrichment :key="route.fullPath" :initial-review="initialReview" />
</template>
