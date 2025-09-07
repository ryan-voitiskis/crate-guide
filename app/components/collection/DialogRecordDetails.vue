<script setup lang="ts">
import { Pencil } from 'lucide-vue-next'

const records = useRecordsStore()
const recordDetails = useRecordDetailsStore()

const dialogOpen = computed({
	get: () => !!recordDetails.selectedRecordId,
	set: (value: boolean) => {
		if (!value) recordDetails.closeRecord()
	}
})
</script>

<template>
	<!-- Main Dialog -->
	<Dialog v-model:open="dialogOpen">
		<DialogContent class="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
			<DialogHeader>
				<div>
					<div>
						<DialogTitle>Record Details</DialogTitle>
						<DialogDescription v-if="recordDetails.selectedRecord">
							{{ recordDetails.selectedRecord.title }}
						</DialogDescription>
					</div>
					<Button
						@click="recordDetails.toggleEditMode()"
						:variant="recordDetails.isEditMode ? 'secondary' : 'outline'"
						size="sm"
						class="mt-2"
					>
						<Pencil class="mr-2 size-4" />
						{{ recordDetails.isEditMode ? 'Cancel Edit' : 'Edit Record' }}
					</Button>
				</div>
			</DialogHeader>

			<div class="-mr-2 flex-1 space-y-6 overflow-auto pr-2 pb-1">
				<!-- Record Details Section -->
				<div class="grid gap-6 md:grid-cols-3">
					<!-- Cover Image -->
					<div class="space-y-2">
						<Label class="text-sm font-medium">Cover</Label>
						<div
							class="bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-lg"
						>
							<img
								v-if="recordDetails.selectedRecord?.cover"
								:src="recordDetails.selectedRecord.cover"
								:alt="recordDetails.selectedRecord?.title"
								class="h-full w-full object-cover"
							/>
							<span v-else class="text-muted-foreground text-sm">No cover</span>
						</div>
						<Input
							v-if="recordDetails.isEditMode"
							:model-value="recordDetails.recordForm.cover ?? undefined"
							@update:model-value="
								recordDetails.recordForm.cover = $event ? String($event) : null
							"
							name="cover"
							placeholder="Cover URL"
							class="text-xs"
						/>
					</div>

					<!-- Record Info -->
					<div class="space-y-4 md:col-span-3">
						<!-- Title -->
						<div class="space-y-2">
							<Label class="font-medium">Title</Label>
							<Input
								v-if="recordDetails.isEditMode"
								v-model="recordDetails.recordForm.title"
								name="title"
								placeholder="Record title"
							/>
							<div v-else>
								{{ recordDetails.selectedRecord?.title }}
							</div>
						</div>

						<!-- Year -->
						<div class="space-y-2">
							<Label class="text-sm font-medium">Year</Label>
							<Input
								v-if="recordDetails.isEditMode"
								:model-value="recordDetails.recordForm.year ?? undefined"
								@update:model-value="
									recordDetails.recordForm.year = $event ? Number($event) : null
								"
								name="year"
								type="number"
								placeholder="Release year"
								class="w-32"
							/>
							<p v-else class="text-muted-foreground">
								{{ recordDetails.selectedRecord?.year || 'Unknown' }}
							</p>
						</div>

						<!-- Artists -->
						<TableRecordArtists />

						<!-- Labels -->
						<div class="space-y-2">
							<Label>
								Labels ({{ recordDetails.selectedRecord?.labels.length || 0 }})
							</Label>
							<div class="space-y-1">
								<div
									v-for="label in recordDetails.selectedRecord?.labels"
									:key="label.name"
									class="bg-muted rounded p-2 text-sm"
								>
									{{ label.name }}
									<span v-if="label.catno" class="text-muted-foreground">
										- {{ label.catno }}
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<SectionRecordTracks />
			</div>

			<!-- Dialog Footer (only shown in edit mode) -->
			<DialogFooter v-if="recordDetails.isEditMode" class="border-t pt-4">
				<Button @click="recordDetails.cancelEdit()" variant="secondary">
					Cancel
				</Button>
				<Button
					@click="recordDetails.saveRecord()"
					:disabled="!recordDetails.canSave"
					:loading="records.isUpdatingRecord"
				>
					Save Changes
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>

	<AlertUnsavedRecordChanges />
	<AlertConfirmDeleteTrack />
	<DialogTrackEdit />
</template>
