<script setup lang="ts">
import { ImageOff } from 'lucide-vue-next'
import type { LoadTrackRecordResult } from '~/utils/loadTrackPicker'

const props = withDefaults(
	defineProps<{
		result: LoadTrackRecordResult
		expanded?: boolean
		showExpansionControl?: boolean
		loadedDeckByTrackId: Record<string, number>
		playedTrackIds: Set<string>
	}>(),
	{
		expanded: false,
		showExpansionControl: true
	}
)

defineEmits<{
	selectTrack: [trackId: string]
	toggleExpanded: []
}>()

const user = useUserStore()

const displayedTracks = computed(() =>
	props.expanded ? props.result.tracks : props.result.previewTracks
)

const matchedTrackIds = computed(() => new Set(props.result.matchedTrackIds))

const artistNames = computed(() =>
	props.result.record.artists.map((artist) => artist.name).join(', ')
)

const firstLabel = computed(() => props.result.record.labels[0])

const hiddenTrackCount = computed(
	() => props.result.tracks.length - props.result.previewTracks.length
)

function getTrackKeyDisplay(track: Track): string | null {
	if (track.key === null || track.mode === null) return null
	return getFormattedKeyString(
		track.key,
		track.mode,
		user.currentKeyFormat,
		'short'
	)
}

function getTrackKeyColor(track: Track): string | null {
	if (track.key === null || track.mode === null) return null
	return getKeyColour(track.key, track.mode)
}
</script>

<template>
	<article class="overflow-hidden rounded-lg border">
		<div class="flex flex-col gap-4 p-3 sm:flex-row">
			<div
				class="bg-muted flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden rounded-none sm:size-36"
			>
				<img
					v-if="result.record.cover"
					:src="result.record.cover"
					:alt="`${result.record.title} cover`"
					class="size-full object-cover"
				/>
				<ImageOff v-else class="text-muted-foreground size-9" />
			</div>

			<div class="min-w-0 flex-1">
				<header class="mb-2 min-w-0">
					<h3
						class="truncate text-sm font-semibold"
						:title="result.record.title"
					>
						{{ result.record.title }}
					</h3>
					<p
						v-if="artistNames"
						class="text-muted-foreground truncate text-xs"
						:title="artistNames"
					>
						{{ artistNames }}
					</p>
					<p class="text-muted-foreground mt-1 flex flex-wrap gap-x-2 text-xs">
						<span v-if="firstLabel?.name">{{ firstLabel.name }}</span>
						<span v-if="firstLabel?.catno" class="font-mono">
							{{ firstLabel.catno }}
						</span>
						<span v-if="result.record.year">{{ result.record.year }}</span>
					</p>
				</header>

				<div class="space-y-1">
					<button
						v-for="track in displayedTracks"
						:key="track.id"
						type="button"
						data-testid="load-track-option"
						:data-track-id="track.id"
						:data-track-match="matchedTrackIds.has(track.id)"
						:class="[
							matchedTrackIds.has(track.id)
								? 'border-primary/40 bg-primary/10 hover:bg-primary/15'
								: 'hover:bg-accent border-transparent',
							'focus-visible:ring-ring flex min-h-8 w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none'
						]"
						@click="$emit('selectTrack', track.id)"
					>
						<span class="text-muted-foreground w-8 shrink-0 pt-0.5 font-mono">
							{{ track.position || '—' }}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium">
								{{ track.title }}
							</span>
							<span
								class="text-muted-foreground mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
							>
								<span v-if="track.bpm" class="shrink-0 tabular-nums">
									{{ track.bpm.toFixed(1) }} BPM
								</span>
								<Badge
									v-if="getTrackKeyDisplay(track)"
									variant="outline"
									class="min-w-8 shrink-0 justify-center px-1 font-medium"
									:style="{ color: getTrackKeyColor(track) ?? undefined }"
								>
									{{ getTrackKeyDisplay(track) }}
								</Badge>
								<span
									v-if="track.rpm === 33 || track.rpm === 45"
									class="shrink-0 tabular-nums"
								>
									{{ track.rpm }} RPM
								</span>
								<Badge
									v-if="playedTrackIds.has(track.id)"
									variant="secondary"
									class="shrink-0 px-1.5"
								>
									Played
								</Badge>
								<Badge
									v-if="loadedDeckByTrackId[track.id]"
									variant="secondary"
									class="shrink-0 px-1.5"
								>
									Deck {{ loadedDeckByTrackId[track.id] }}
								</Badge>
							</span>
						</span>
					</button>
				</div>

				<Button
					v-if="showExpansionControl && hiddenTrackCount > 0"
					variant="ghost"
					size="sm"
					class="mt-1 h-8 px-2 text-xs"
					@click="$emit('toggleExpanded')"
				>
					{{ expanded ? 'Show fewer' : `Show ${hiddenTrackCount} more` }}
				</Button>
			</div>
		</div>
	</article>
</template>
