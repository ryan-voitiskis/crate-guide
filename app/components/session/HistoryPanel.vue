<script setup lang="ts">
import { ListX } from 'lucide-vue-next'

const session = useSessionStore()
</script>

<template>
	<div class="flex h-full flex-col">
		<div class="flex items-center justify-between px-3 py-2">
			<span class="font-medium">Session History</span>
			<div class="flex items-center gap-2">
				<span class="text-muted-foreground text-sm">
					{{ session.sessionTrackCount }} tracks
				</span>
				<Button
					v-if="session.currentSession.length > 0"
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					title="Clear session"
					@click="session.clearSession()"
				>
					<ListX class="h-4 w-4" />
				</Button>
			</div>
		</div>

		<Separator />

		<ScrollArea class="flex-1">
			<div v-if="session.currentSession.length > 0" class="px-3">
				<HistoryTrackCard
					v-for="(entry, index) in session.currentSession"
					:key="entry.track_id + entry.time_added"
					:entry="entry"
					:index="index"
					:is-first="index === 0"
				/>
			</div>

			<div
				v-else
				class="text-muted-foreground flex h-32 items-center justify-center text-center text-sm"
			>
				No tracks played yet
			</div>
		</ScrollArea>
	</div>
</template>
