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
				<Plus class="mr-1 size-4" />
				Add Track
			</Button>
		</div>

		<!-- Tracks List -->
		<div class="space-y-2">
			<Card
				v-for="track in recordDetails.recordTracks"
				:key="track.id"
				class="hover:bg-muted/50 flex flex-row items-center gap-1 p-1.5"
			>
				<!-- Position -->
				<div class="text-muted-foreground w-9 text-center font-mono text-sm">
					{{ track.position || '–' }}
				</div>

				<!-- Title & Artists -->
				<div class="min-w-0 flex-1">
					<div class="h-5 truncate text-sm leading-5 font-medium">
						{{ track.title }}
					</div>
					<div class="text-muted-foreground h-4 truncate text-xs leading-4">
						<span v-if="track.artists.length">
							{{ track.artists.map((a) => a.name).join(', ') }}
						</span>
						<span v-if="track.extraartists.length">
							{{
								track.extraartists.length
									? ' feat. ' + track.extraartists.map((a) => a.name).join(', ')
									: ''
							}}
						</span>
					</div>
				</div>

				<!-- Duration -->
				<div class="text-muted-foreground w-8 text-right text-sm">
					{{ formatDuration(track.duration) }}
				</div>

				<!-- BPM -->
				<div class="text-muted-foreground w-8 text-right text-sm">
					{{ track.bpm ? Math.round(track.bpm) : '–' }}
				</div>

				<!-- Key -->
				<div class="text-muted-foreground w-8 text-center text-sm">
					{{ formatKey(track.key) }}
				</div>

				<!-- Actions -->
				<Button
					@click="trackEdit.openEditTrackDialog(track.id)"
					size="icon"
					variant="ghost"
				>
					<Pencil />
				</Button>
				<Button
					@click="recordDetails.trackToConfirmDelete = track"
					size="icon"
					variant="destructive-ghost"
				>
					<Trash />
				</Button>
			</Card>

			<div
				v-if="!recordDetails.recordTracks.length"
				class="text-muted-foreground py-8 text-center"
			>
				No tracks found. Add some tracks to get started.
			</div>
		</div>
	</div>
</template>
