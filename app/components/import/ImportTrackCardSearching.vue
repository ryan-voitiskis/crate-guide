<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

const props = defineProps<{
	trackId: string
	title: string
	artist: string
}>()

const tracks = useTracksStore()
const records = useRecordsStore()

const coverUrl = computed(() => {
	const track = tracks.getTrackById(props.trackId)
	if (!track) return null
	const record = records.getRecordById(track.record_id)
	return record?.cover ?? null
})
</script>

<template>
	<div class="flex items-center gap-3 rounded-md border p-3">
		<div class="relative h-13 w-13 shrink-0 overflow-hidden rounded">
			<img
				v-if="coverUrl"
				:src="coverUrl"
				:alt="title"
				class="h-full w-full object-cover"
			/>
			<div
				v-else
				class="bg-muted flex h-full w-full items-center justify-center"
			>
				<span class="text-muted-foreground text-[10px]">No cover</span>
			</div>
			<div
				class="absolute inset-0 flex items-center justify-center bg-black/40"
			>
				<Loader2 class="h-5 w-5 animate-spin text-white" />
			</div>
		</div>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium">{{ title }}</p>
			<p class="text-muted-foreground truncate text-xs">{{ artist }}</p>
		</div>
	</div>
</template>
