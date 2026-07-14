<script setup lang="ts">
import { Download, Layers3 } from 'lucide-vue-next'

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
						Only checked releases will be added to your physical library.
					</DialogDescription>
				</DialogHeader>
			</div>

			<div
				class="border-border bg-workbench-inset flex items-center justify-between gap-4 border-y px-4 py-2 sm:px-5"
			>
				<div class="flex items-center gap-2">
					<Layers3 class="text-muted-foreground size-3.5" />
					<div class="font-mono text-[10px] tabular-nums">
						{{
							selectedCount === 0
								? 'No releases selected'
								: `${selectedCount} / ${discogs.releasesToImport.length} selected`
						}}
					</div>
				</div>
				<Label
					class="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs"
				>
					Select all
					<Checkbox v-model="allSelected" />
				</Label>
			</div>

			<ScrollArea class="bg-workbench-inset min-h-0">
				<div class="flex flex-col gap-1.5 p-3 sm:p-4">
					<CardDiscogsRelease
						v-for="(release, i) in discogs.releasesToImport"
						:key="i"
						:release="release"
						show-checkbox
						@update:selected="(val) => (release.selected = val)"
					/>
				</div>
			</ScrollArea>

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
