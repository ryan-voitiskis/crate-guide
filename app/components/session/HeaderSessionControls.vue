<script setup lang="ts">
import {
	AlertTriangle,
	Disc3,
	FolderOpen,
	History,
	Save
} from 'lucide-vue-next'

const session = useWorkbenchSessionStore()
const capabilities = useWorkbenchCapabilities()

function handleDeckCountChange(value: unknown) {
	if (typeof value === 'string' && value) {
		session.initializeDecks(Number(value))
	}
}
</script>

<template>
	<!-- Left: Deck count selector -->
	<div class="flex items-center gap-1.5">
		<span
			class="text-muted-foreground hidden font-mono text-[10px] tracking-wide uppercase xl:inline"
		>
			Decks
		</span>
		<ToggleGroup
			type="single"
			variant="outline"
			:model-value="String(session.deckCount)"
			aria-label="Number of decks"
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
	<div class="flex items-center gap-1">
		<Toggle
			:pressed="session.showTurntableSim"
			aria-label="Toggle turntable"
			class="gap-0"
			@click="session.showTurntableSim = !session.showTurntableSim"
		>
			<Disc3 class="size-4 sm:mr-1.5" />
			<span class="hidden sm:inline">Turntable</span>
		</Toggle>

		<Toggle
			:pressed="session.showHistory"
			aria-label="Toggle history"
			class="gap-0"
			@click="session.showHistory = !session.showHistory"
		>
			<History class="size-4 sm:mr-1.5" />
			<span class="hidden sm:inline">History</span>
		</Toggle>
	</div>

	<!-- Right: Session actions -->
	<div class="flex items-center gap-1">
		<div
			v-if="session.autoSaveError"
			class="text-destructive border-destructive/30 bg-destructive/10 flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
			aria-live="polite"
		>
			<AlertTriangle class="size-3.5 shrink-0" />
			<span class="md:hidden">Auto-save failed</span>
			<span class="hidden max-w-56 md:inline">
				{{ session.autoSaveError }}
			</span>
		</div>
		<Button
			variant="outline"
			size="sm"
			:disabled="session.isLoadingSets || !capabilities.canPersistSessions"
			aria-label="Open saved sets"
			title="Saved sets"
			@click="session.showSetManager = true"
		>
			<FolderOpen class="size-4 lg:mr-1.5" />
			<span class="hidden lg:inline">Sets</span>
		</Button>

		<Button
			variant="outline"
			size="sm"
			:disabled="
				session.currentSession.length === 0 || !capabilities.canPersistSessions
			"
			aria-label="Save current set"
			:title="session.autoSaveError ?? 'Save current set'"
			@click="session.showSaveDialog = true"
		>
			<Save class="size-4 lg:mr-1.5" />
			<span class="hidden lg:inline">Save</span>
		</Button>
	</div>
</template>
