<script setup lang="ts">
const discogs = useDiscogsStore()
const showDialog = ref(false)

async function handleDisconnect() {
	await discogs.disconnectDiscogs()
	showDialog.value = false
}
</script>

<template>
	<Button variant="secondary" class="ml-auto" @click="showDialog = true">
		Disconnect
	</Button>

	<Dialog v-model:open="showDialog">
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle>Disconnect Discogs</DialogTitle>
				<DialogDescription class="text-muted-foreground text-sm">
					This will disable Discogs imports and features. Your existing
					collection will remain in Crate Guide, and you can reconnect anytime.
				</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<Button
					variant="destructive"
					:loading="discogs.isDisconnecting"
					@click="handleDisconnect"
				>
					Disconnect
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
