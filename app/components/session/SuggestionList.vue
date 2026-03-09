<script setup lang="ts">
defineProps<{
	suggestions: ScoredTrack[]
	deckIndex: number
}>()
</script>

<template>
	<div class="flex h-full flex-col">
		<div class="mb-2 flex items-center justify-between px-1">
			<span class="text-muted-foreground text-sm font-medium">Suggestions</span>
			<span class="text-muted-foreground text-xs">
				{{ suggestions.length }}
			</span>
		</div>

		<ScrollArea class="flex-1">
			<div v-if="suggestions.length > 0" class="space-y-2">
				<SuggestionCard
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
