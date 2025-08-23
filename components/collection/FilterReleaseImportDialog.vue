<script setup lang="ts">
const discogs = useDiscogsStore()
</script>

<template>
	<Dialog v-model:open="discogs.showFilterDialog">
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle>Filter Releases</DialogTitle>
				<div class="mb-4 text-sm text-muted-foreground">
					Select the releases you want to import into your collection.
				</div>
			</DialogHeader>

			<div class="grid gap-4 py-4">
				<DiscogsReleaseShort
					v-for="(release, i) in discogs.releasesToFilter"
					:key="i"
					:release="release"
				/>
			</div>

			<DialogFooter>
				<Button @click="discogs.showFilterDialog = false" variant="secondary">
					Cancel
				</Button>
				<Button @click="discogs.getSelectedFolder()" variant="default">
					Import
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
