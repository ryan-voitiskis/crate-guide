<script setup lang="ts">
import { Disc3, FolderOpen, History, Save } from 'lucide-vue-next'

const session = useSessionStore()

function handleDeckCountChange(value: unknown) {
	if (typeof value === 'string' && value) {
		session.initializeDecks(Number(value))
	}
}
</script>

<template>
	<!-- Left: Deck count selector -->
	<div class="flex items-center gap-2">
		<span class="text-muted-foreground text-sm">Decks</span>
		<ToggleGroup
			type="single"
			variant="outline"
			:model-value="String(session.deckCount)"
			@update:model-value="handleDeckCountChange"
		>
			<ToggleGroupItem
				v-for="count in [1, 2, 3, 4]"
				:key="count"
				:value="String(count)"
				variant="outline"
				size="sm"
			>
				{{ count }}
			</ToggleGroupItem>
		</ToggleGroup>
	</div>

	<!-- Center: Toggles -->
	<div class="flex items-center gap-2">
		<Toggle
			:pressed="session.showTurntableSim"
			aria-label="Toggle turntable"
			@click="session.showTurntableSim = !session.showTurntableSim"
		>
			<Disc3 class="mr-1.5 h-4 w-4" />
			Turntable
		</Toggle>

		<Toggle
			:pressed="session.showHistory"
			aria-label="Toggle history"
			@click="session.showHistory = !session.showHistory"
		>
			<History class="mr-1.5 h-4 w-4" />
			History
		</Toggle>
	</div>

	<!-- Right: Session actions -->
	<div class="flex items-center gap-2">
		<Button
			variant="outline"
			size="sm"
			:disabled="session.isLoadingSets"
			@click="session.showSetManager = true"
		>
			<FolderOpen class="mr-1.5 h-4 w-4" />
			Sets
		</Button>

		<Button
			variant="outline"
			size="sm"
			:disabled="session.currentSession.length === 0"
			@click="session.showSaveDialog = true"
		>
			<Save class="mr-1.5 h-4 w-4" />
			Save
		</Button>

	</div>
</template>
