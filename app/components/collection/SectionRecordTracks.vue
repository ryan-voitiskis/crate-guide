<script setup lang="ts">
import { Pencil, Plus, Trash } from 'lucide-vue-next'

const recordDetails = useRecordDetailsStore()
const trackEdit = useTrackEditStore()
</script>

<template>
	<div class="space-y-4">
		<div class="flex items-center justify-between">
			<Label>Tracks ({{ recordDetails.recordTracks.length }})</Label>
			<Button
				@click="trackEdit.openAddTrackDialog()"
				size="sm"
				variant="outline"
			>
				<Plus class="mr-2 size-4" />
				Add Track
			</Button>
		</div>

		<!-- Tracks List -->
		<div class="space-y-2">
			<div
				v-for="track in recordDetails.recordTracks"
				:key="track.id"
				class="hover:bg-muted/50 flex items-center gap-4 rounded-lg border px-2 py-1"
			>
				<!-- Position -->
				<div class="text-muted-foreground w-12 font-mono text-sm">
					{{ track.position || '–' }}
				</div>

				<!-- Title & Artists -->
				<div class="min-w-0 flex-1">
					<div class="truncate font-medium">{{ track.title }}</div>
					<div class="text-muted-foreground truncate text-sm">
						<span v-if="track.artists.length">
							{{ track.artists.map((a) => a.name).join(', ') }}
						</span>
						<span v-if="track.extraartists.length">
							{{
								track.extraartists.length
									? ' feat. ' +
										track.extraartists.map((a) => a.name).join(', ')
									: ''
							}}
						</span>
					</div>
				</div>

				<!-- Duration -->
				<div class="text-muted-foreground w-16 text-right text-sm">
					{{ formatDuration(track.duration) }}
				</div>

				<!-- BPM -->
				<div class="text-muted-foreground w-16 text-right text-sm">
					{{ track.bpm ? Math.round(track.bpm) : '–' }}
				</div>

				<!-- Key -->
				<div class="text-muted-foreground w-12 text-center text-sm">
					{{ formatKey(track.key) }}
				</div>

				<!-- Actions -->
				<div class="flex gap-1">
					<Button
						@click="trackEdit.openEditTrackDialog(track.id)"
						size="sm"
						variant="ghost"
					>
						<Pencil class="size-4" />
					</Button>
					<Button
						@click="recordDetails.trackToConfirmDelete = track"
						size="sm"
						variant="ghost"
						class="text-destructive-foreground"
					>
						<Trash class="size-4" />
					</Button>
				</div>
			</div>

			<div
				v-if="!recordDetails.recordTracks.length"
				class="text-muted-foreground py-8 text-center"
			>
				No tracks found. Add some tracks to get started.
			</div>
		</div>
	</div>
</template>
