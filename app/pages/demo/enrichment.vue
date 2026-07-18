<script setup lang="ts">
import type { ReviewFilter } from '~/composables/useTrackEnrichmentWorkflow'
import { createDemoEnrichmentReview } from '~/demo/enrichmentFixtures'
import EnrichmentPage from '../enrichment.vue'

provideDemoWorkbench()

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
	<EnrichmentPage :key="route.fullPath" :initial-review="initialReview" />
</template>
