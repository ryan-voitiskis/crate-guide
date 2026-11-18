<script setup lang="ts">
import { createKeyComposite } from '~/utils/keyFunctions'
import type { LibraryKeyFormat, LibraryTrack } from '~~/shared/types/library'

/**
 * Quick-set controls bound to a saved track. Every confirmed value is written
 * straight to the library with the track's version as a precondition.
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
</script>

<template>
	<PanelTrackQuickSet
		:bpm="track.bpm"
		:key-composite="keyComposite"
		:key-format="keyFormat"
		:read-only="readOnly"
		:pending-bpm="quickSet.pending.value.bpm"
		:pending-key="quickSet.pending.value.key"
		:conflict="quickSet.conflict.value"
		@update:bpm="quickSet.setBpm"
		@update:key-composite="quickSet.setKey"
	/>
</template>
