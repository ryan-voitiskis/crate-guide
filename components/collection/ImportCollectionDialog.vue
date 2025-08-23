<script setup lang="ts">
const discogs = useDiscogsStore()
</script>

<template>
	<Dialog @update:open="discogs.getFolders()">
		<DialogTrigger as-child>
			<Button variant="secondary" class="ml-auto">
				Import Discogs Collection
			</Button>
		</DialogTrigger>
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle>Import Discogs Collection</DialogTitle>
				<div class="mb-4 text-sm text-muted-foreground">
					Select the folder you want to import from. You'll be able to deselect
					releases from it.
				</div>
				<LoadingSpinner
					v-if="discogs.isLoadingFolders"
					class="mx-auto h-16 w-16 text-primary/30"
				/>
				<div v-else-if="discogs.folders.length === 0">
					<div class="mx-auto h-16 w-16 text-primary/30">No folders found</div>
				</div>
				<div v-else>
					<RadioGroup v-model="discogs.selectedFolder" class="space-y-0.5">
						<Label
							v-for="folder in discogs.folders"
							:key="folder.id"
							class="[&:has([data-state=checked])>div]:border-primary"
						>
							<RadioGroupItem :value="folder.name" class="sr-only" />
							<div
								class="flex w-full cursor-pointer items-center justify-between rounded-lg border-2 border-muted p-3 hover:border-accent"
							>
								<span class="font-medium">{{ folder.name }}</span>
								<span class="text-sm text-muted-foreground">
									({{ folder.count }} releases)
								</span>
							</div>
						</Label>
					</RadioGroup>
				</div>
			</DialogHeader>
			<DialogFooter>
				<Button
					@click="discogs.getSelectedFolder()"
					variant="default"
					:loading="discogs.isLoadingSelectedFolder"
				>
					Confirm
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
