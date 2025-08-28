<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'

const discogs = useDiscogsStore()
const user = useUserStore()

function onDialogOpen() {
	if (!discogs.folders.length) discogs.getFolders()
}
</script>

<template>
	<Dialog
		v-model:open="discogs.showGetFoldersDialog"
		@update:open="onDialogOpen"
	>
		<DialogTrigger as-child>
			<Button
				variant="secondary"
				class="ml-auto"
				:disabled="!user.isDiscogsAuthenticated"
			>
				Import Discogs Collection
			</Button>
		</DialogTrigger>
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle>Import Discogs Collection</DialogTitle>
				<div class="text-muted-foreground mb-4 text-sm">
					Select the folder you want to import from. You'll be able to deselect
					releases from it.
				</div>
				<LoadingSpinner
					v-if="discogs.isLoadingFolders"
					class="text-primary/30 mx-auto h-16 w-16"
				/>
				<div v-else class="flex justify-end">
					<Button @click="discogs.getFolders()" variant="secondary">
						<RefreshCw />
					</Button>
				</div>
				<div v-if="!discogs.isLoadingFolders && discogs.folders.length === 0">
					<div class="text-muted-foreground text-center">No folders found</div>
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
								class="border-muted hover:border-accent flex w-full cursor-pointer items-center justify-between rounded-lg border-2 p-3"
							>
								<span class="font-medium">{{ folder.name }}</span>
								<span class="text-muted-foreground text-sm">
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
