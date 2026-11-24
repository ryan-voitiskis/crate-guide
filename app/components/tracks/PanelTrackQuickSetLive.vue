<script setup lang="ts">
import { describeQuickSetIssue } from '~/composables/useTrackQuickSet'
import { createKeyComposite } from '~/utils/keyFunctions'
import type { LibraryKeyFormat, LibraryTrack } from '~~/shared/types/library'

/**
 * Quick-set controls bound to a saved track. Every confirmed value is written
 * straight to the library with the track's version as a precondition. Pending
 * and rejected writes are held per track, so they show again if this panel is
 * remounted for the same track.
 */
const props = defineProps<{
	track: LibraryTrack
	keyFormat: LibraryKeyFormat
	readOnly?: boolean
}>()

const quickSet = useTrackQuickSet(() => props.track)

const keyComposite = computed(() =>
	createKeyComposite(props.track.key, props.track.mode)
)

const issueViews = computed(() =>
	quickSet.issues.value.map((issue) =>
		describeQuickSetIssue(issue, props.keyFormat, quickSet.needsRefresh.value)
	)
)
</script>

<template>
	<PanelTrackQuickSet
		:bpm="track.bpm"
		:key-composite="keyComposite"
		:key-format="keyFormat"
		value-source="saved"
		:read-only="readOnly || quickSet.needsRefresh.value"
		:pending-bpm="quickSet.pending.value.bpm"
		:pending-key="quickSet.pending.value.key"
		:issues="issueViews"
		:needs-refresh="quickSet.needsRefresh.value"
		:refreshing="quickSet.refreshing.value"
		@update:bpm="quickSet.setBpm"
		@update:key-composite="quickSet.setKey"
		@retry="quickSet.retry"
		@refresh="quickSet.refresh"
		@dismiss="quickSet.dismiss"
	/>
</template>
