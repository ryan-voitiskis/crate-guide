<script setup lang="ts">
import { Download, Layers3 } from 'lucide-vue-next'
import ListWorkbenchVirtual from '~/components/workbench/ListWorkbenchVirtual.vue'

const discogs = useWorkbenchDiscogsStore()

const selectedCount = computed(
	() => discogs.releasesToImport.filter((release) => release.selected).length
)

const importableReleases = computed(() =>
	discogs.releasesToImport.filter((release) => !release.alreadyImported)
)

const alreadyImportedCount = computed(
	() => discogs.releasesToImport.length - importableReleases.value.length
)

const allSelected = computed({
	get: () =>
		importableReleases.value.length > 0 &&
		importableReleases.value.every((release) => release.selected),
	set: (value) => {
		importableReleases.value.forEach((release) => (release.selected = value))
	}
})

function getReleaseKey(release: DiscogsReleaseToFilter) {
	return release.id
}
</script>

<template>
	<Dialog v-model:open="discogs.showFilterDialog">
		<DialogContent
			class="max-h-[88dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-sm p-0 sm:max-w-2xl"
		>
			<div class="space-y-2 px-4 pt-4 pr-11 pb-3 sm:px-5 sm:pt-5 sm:pr-12">
				<div
					class="text-muted-foreground font-mono text-[9px] tracking-[0.18em] uppercase"
				>
					Discogs / Import manifest
				</div>
				<DialogHeader>
					<DialogTitle class="text-base tracking-tight">
						Review releases
					</DialogTitle>
					<DialogDescription class="text-muted-foreground text-sm">
						New releases are selected. Records already in your library are
						marked and skipped.
					</DialogDescription>
				</DialogHeader>
			</div>

			<div
				class="border-border bg-workbench-inset flex items-center justify-between gap-4 border-y px-4 py-2 sm:px-5"
			>
				<div class="flex min-w-0 items-center gap-2">
					<Layers3 class="text-muted-foreground size-3.5" />
					<div class="truncate font-mono text-[10px] tabular-nums">
						{{
							`${selectedCount} selected · ${alreadyImportedCount} in library`
						}}
					</div>
				</div>
				<Label
					class="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs"
				>
					Select all
					<Checkbox
						v-model="allSelected"
						:disabled="importableReleases.length === 0"
					/>
				</Label>
			</div>

			<!-- @vue-generic {DiscogsReleaseToFilter} -->
			<ListWorkbenchVirtual
				:items="discogs.releasesToImport"
				:get-item-key="getReleaseKey"
				:item-size="70"
				:header-size="12"
				:initial-viewport-size="500"
				label="Discogs releases available for import"
				item-label="Discogs releases"
				data-testid="discogs-release-candidates"
				class="bg-workbench-inset min-h-0"
			>
				<template #header><div class="h-3" /></template>
				<template #default="{ item: release }">
					<div
						class="h-full px-3 pb-1.5 sm:px-4"
						:data-candidate-release-id="release.id"
					>
						<CardDiscogsRelease
							:release="release"
							show-checkbox
							class="h-16"
							@update:selected="(val) => (release.selected = val)"
						/>
					</div>
				</template>
			</ListWorkbenchVirtual>

			<DialogFooter
				class="border-border bg-background border-t px-4 py-3 sm:px-5"
			>
				<Button variant="secondary" @click="discogs.showFilterDialog = false">
					Cancel
				</Button>
				<Button
					variant="default"
					:disabled="selectedCount === 0"
					@click="discogs.importSelectedReleases()"
				>
					<Download class="mr-2 size-4" />
					Import {{ selectedCount }}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
