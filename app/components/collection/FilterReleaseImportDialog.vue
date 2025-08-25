<script setup lang="ts">
const discogs = useDiscogsStore()

const selectedCount = computed(
	() => discogs.releasesToImport.filter((release) => release.selected).length
)

const allSelected = computed({
	get: () => discogs.releasesToImport.length === selectedCount.value,
	set: (value) => {
		discogs.releasesToImport.forEach((release) => (release.selected = value))
	}
})
</script>

<template>
	<Dialog v-model:open="discogs.showFilterDialog">
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle>Filter Releases</DialogTitle>
				<div class="text-muted-foreground text-sm">
					Select the releases you want to import into your collection.
				</div>
			</DialogHeader>

			<div class="flex justify-between gap-4">
				<div class="text-muted-foreground text-sm">
					{{
						selectedCount === 0
							? 'No records selected for import'
							: `${selectedCount}/${discogs.releasesToImport.length} records selected`
					}}
				</div>
				<Label class="text-muted-foreground text-sm">
					Select all
					<Checkbox v-model="allSelected" />
				</Label>
			</div>

			<ScrollArea class="max-h-80">
				<div class="flex flex-col gap-2">
					<DiscogsReleaseShort
						v-for="(release, i) in discogs.releasesToImport"
						:key="i"
						:release="release"
					/>
				</div>
			</ScrollArea>

			<DialogFooter>
				<Button @click="discogs.showFilterDialog = false" variant="secondary">
					Cancel
				</Button>
				<Button
					@click="discogs.importSelectedReleases()"
					variant="default"
					:disabled="selectedCount === 0"
				>
					Import
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
