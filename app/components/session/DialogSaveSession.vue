<script setup lang="ts">
const session = useSessionStore()

const setName = ref('')

async function handleSave() {
	await session.saveSession(setName.value || undefined)
	setName.value = ''
}

function handleOpenChange(open: boolean) {
	if (!open) {
		session.showSaveDialog = false
		setName.value = ''
	}
}
</script>

<template>
	<Dialog :open="session.showSaveDialog" @update:open="handleOpenChange">
		<DialogContent class="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>Save Session</DialogTitle>
				<DialogDescription>
					Save your current session of {{ session.sessionTrackCount }} tracks.
				</DialogDescription>
			</DialogHeader>

			<div class="py-4">
				<Label for="set-name">Set Name (optional)</Label>
				<Input
					id="set-name"
					v-model="setName"
					placeholder="My DJ Set"
					class="mt-2"
					@keyup.enter="handleSave"
				/>
			</div>

			<DialogFooter>
				<Button variant="ghost" @click="session.showSaveDialog = false">
					Cancel
				</Button>
				<Button
					@click="handleSave"
					:loading="session.isSavingSession"
				>
					Save
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
