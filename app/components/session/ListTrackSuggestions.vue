<script setup lang="ts">
defineProps<{
	suggestions: ScoredTrack[]
	deckIndex: number
}>()
</script>

<template>
	<div class="flex h-full flex-col">
		<div class="mb-1.5 flex items-center justify-between px-1">
			<span
				class="text-muted-foreground font-mono text-[9px] font-medium tracking-[0.14em] uppercase"
			>
				Mix candidates
			</span>
			<span class="text-muted-foreground font-mono text-[10px] tabular-nums">
				{{ suggestions.length }}
			</span>
		</div>

		<ScrollArea class="flex-1">
			<div v-if="suggestions.length > 0" class="bg-border space-y-px">
				<CardTrackSuggestion
					v-for="track in suggestions"
					:key="track.id"
					:track="track"
					:deck-index="deckIndex"
				/>
			</div>

			<div
				v-else
				class="text-muted-foreground flex h-32 items-center justify-center text-center text-sm"
			>
				Load a track to see suggestions
			</div>
		</ScrollArea>
	</div>
</template>
