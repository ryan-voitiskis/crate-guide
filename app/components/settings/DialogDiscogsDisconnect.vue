<script setup lang="ts">
const discogs = useDiscogsStore()
const showDialog = ref(false)

async function handleDisconnect() {
	await discogs.disconnectDiscogs()
	showDialog.value = false
}
</script>

<template>
	<Button @click="showDialog = true" variant="secondary" class="ml-auto">
		Disconnect
	</Button>

	<Dialog v-model:open="showDialog">
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle>Disconnect Discogs</DialogTitle>
				<div class="text-muted-foreground text-sm">
					<p>
						Are you sure you want to disconnect Crate Guide from your Discogs
						account?
					</p>
					<p>
						You will no longer be able to import your collection or complete any
						actions requiring this connection. Although your collection will
						remain in your Crate Guide library. You can always reconnect later.
					</p>
				</div>
			</DialogHeader>
			<DialogFooter>
				<Button
					@click="handleDisconnect"
					variant="destructive"
					:loading="discogs.isDisconnecting"
				>
					Disconnect
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
