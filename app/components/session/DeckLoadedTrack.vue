<script setup lang="ts">
import { Upload } from 'lucide-vue-next'

const props = defineProps<{
	track?: Track
	deckIndex: number
}>()

const emit = defineEmits<{
	load: []
}>()

const records = useRecordsStore()
const session = useSessionStore()
const user = useUserStore()

const record = computed(() => {
	if (!props.track) return null
	return records.getRecordById(props.track.record_id)
})

// Original key display
const keyDisplay = computed(() => {
	if (!props.track || props.track.key === null || props.track.mode === null)
		return null
	return getFormattedKeyString(
		props.track.key,
		props.track.mode,
		user.currentKeyFormat,
		'short'
	)
})

const keyColor = computed(() => {
	if (!props.track || props.track.key === null || props.track.mode === null)
		return null
	return getKeyColour(props.track.key, props.track.mode)
})

// Adjusted BPM/Key from deck
const adjustedBpm = computed(() => {
	return session.getAdjustedBpm(props.deckIndex)
})

const adjustedKey = computed(() => {
	return session.getAdjustedKey(props.deckIndex)
})

const adjustedKeyDisplay = computed(() => {
	if (adjustedKey.value === null || !props.track || props.track.mode === null)
		return null
	return getFormattedKeyString(
		Math.round(adjustedKey.value) % 12,
		props.track.mode,
		user.currentKeyFormat,
		'short'
	)
})

const adjustedKeyColor = computed(() => {
	if (adjustedKey.value === null || !props.track || props.track.mode === null)
		return null
	return getKeyColour(Math.round(adjustedKey.value) % 12, props.track.mode)
})

const artistNames = computed(() => {
	if (!props.track) return ''
	return props.track.artists.map((a) => a.name).join(', ')
})
</script>

<template>
	<Card class="h-24 overflow-hidden rounded-none py-0">
		<CardContent class="h-full p-0">
			<!-- Empty state -->
			<button
				v-if="!track"
				class="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex h-full w-full items-center justify-center gap-2 transition-colors"
				@click="emit('load')"
			>
				<Upload class="h-5 w-5" />
				<span class="text-sm font-medium">Load Track</span>
			</button>

			<!-- Loaded state -->
			<div v-else class="flex h-full gap-3 pr-3">
				<!-- Cover image (full height) -->
				<div class="relative aspect-square h-full shrink-0 overflow-hidden">
					<ImageRecordCover
						v-if="record"
						:record="record"
						:alt="track.title"
						class="size-full"
					/>
					<div
						v-if="!record"
						class="bg-muted flex h-full w-full items-center justify-center"
					>
						<span class="text-muted-foreground text-xs">No cover</span>
					</div>
				</div>

				<!-- Track info -->
				<div class="flex min-w-0 flex-1 flex-col justify-center space-y-1">
					<!-- Title -->
					<div class="truncate leading-tight font-medium">
						{{ track.title }}
					</div>

					<!-- Artists -->
					<div class="text-muted-foreground truncate text-sm">
						{{ artistNames }}
					</div>

					<!-- Track metadata row -->
					<div class="flex items-center gap-3 text-xs">
						<!-- Original BPM -->
						<span v-if="track.bpm" class="text-muted-foreground">
							{{ track.bpm.toFixed(1) }} BPM
						</span>

						<!-- Original key -->
						<span
							v-if="keyDisplay"
							class="font-medium"
							:style="{ color: keyColor ?? undefined }"
						>
							{{ keyDisplay }}
						</span>

						<!-- Position -->
						<span v-if="track.position" class="text-muted-foreground">
							{{ track.position }}
						</span>
					</div>
				</div>

				<!-- Adjusted BPM/Key display -->
				<div
					v-if="adjustedBpm || adjustedKeyDisplay"
					class="flex shrink-0 items-center gap-4"
				>
					<div v-if="adjustedBpm" class="text-center">
						<div class="font-mono text-lg font-semibold tabular-nums">
							{{ adjustedBpm.toFixed(1) }}
						</div>
						<div class="text-muted-foreground text-[10px]">BPM</div>
					</div>
					<div v-if="adjustedKeyDisplay" class="text-center">
						<div
							class="font-mono text-lg font-semibold"
							:style="adjustedKeyColor ? { color: adjustedKeyColor } : {}"
						>
							{{ adjustedKeyDisplay }}
						</div>
						<div class="text-muted-foreground text-[10px]">Key</div>
					</div>
				</div>
			</div>
		</CardContent>
	</Card>
</template>
