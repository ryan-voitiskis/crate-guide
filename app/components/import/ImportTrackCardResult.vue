<script setup lang="ts">
import { CheckCircle, XCircle } from 'lucide-vue-next'

const props = defineProps<{
	result: {
		trackId: string
		title: string
		artist: string
		image: string | null
		success: boolean
		error?: string
		bpm?: number | null
		key?: string
		genre?: string
	}
}>()

const tracks = useTracksStore()
const records = useRecordsStore()

const imageError = ref(false)

const coverUrl = computed(() => {
	const track = tracks.getTrackById(props.result.trackId)
	if (!track) return null
	const record = records.getRecordById(track.record_id)
	return record?.cover ?? null
})

const keyColor = computed(() => {
	if (!props.result.key) return null
	const parsed = parseBeatportKey(props.result.key)
	if (parsed.key === null || parsed.mode === null) return null
	return getKeyColour(parsed.key, parsed.mode)
})

function onImageError() {
	imageError.value = true
}

watch(
	() => props.result.image,
	() => {
		imageError.value = false
	}
)
</script>

<template>
	<div class="min-w-0 overflow-hidden rounded-md bg-zinc-800">
		<!-- Waveform area - shows waveform if found, blank if not -->
		<div class="h-17.5 w-full overflow-hidden bg-zinc-800">
			<img
				v-if="result.success && result.image && !imageError"
				:src="result.image"
				:alt="result.title"
				class="h-full w-full object-contain"
				@error="onImageError"
			/>
		</div>

		<!-- Metadata row with cover -->
		<div class="flex items-center gap-3 p-3">
			<!-- Cover image -->
			<div class="h-13 w-13 shrink-0 overflow-hidden rounded">
				<img
					v-if="coverUrl"
					:src="coverUrl"
					:alt="result.title"
					class="h-full w-full object-cover"
				/>
				<div
					v-else
					class="bg-muted flex h-full w-full items-center justify-center"
				>
					<span class="text-muted-foreground text-[10px]">No cover</span>
				</div>
			</div>

			<!-- Status icon -->
			<component
				:is="result.success ? CheckCircle : XCircle"
				class="h-4 w-4 shrink-0"
				:class="result.success ? 'text-green-400' : 'text-red-400'"
			/>

			<!-- Track info -->
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-zinc-100">
					{{ result.title }}
				</p>
				<p
					class="truncate text-xs"
					:class="result.success ? 'text-green-300' : 'text-red-300'"
				>
					{{
						result.success
							? result.artist
							: result.error || 'No matching track found'
					}}
				</p>
			</div>

			<!-- BPM / Key / Genre - only shown on success -->
			<div
				v-if="result.success"
				class="w-40 shrink-0 space-y-0.5 text-right text-xs"
			>
				<p v-if="result.bpm" class="text-zinc-400">{{ result.bpm }} BPM</p>
				<p
					v-if="result.key"
					class="font-medium"
					:style="keyColor ? { color: keyColor } : undefined"
				>
					{{ result.key }}
				</p>
				<p v-if="result.genre" class="truncate text-zinc-500">
					{{ result.genre }}
				</p>
			</div>
		</div>
	</div>
</template>
