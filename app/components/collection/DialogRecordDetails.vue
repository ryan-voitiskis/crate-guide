<script setup lang="ts">
import { Pencil, PencilOff } from 'lucide-vue-next'

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
		<DialogContent
			class="max-h-[90dvh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] p-0"
		>
			<DialogHeader class="p-6 pb-0">
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
						<PencilOff v-if="recordDetails.isEditMode" class="mr-2 size-4" />
						<Pencil v-else class="mr-2 size-4" />
						{{ recordDetails.isEditMode ? 'Cancel Edit' : 'Edit Record' }}
					</Button>
				</div>
			</DialogHeader>

			<div class="space-y-6 overflow-y-auto px-6 py-4">
				<!-- Record Details Section -->
				<div class="grid gap-6 md:grid-cols-3">
					<!-- Cover Image -->
					<div class="space-y-2">
						<Label>Cover</Label>
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
					<div class="space-y-4 text-sm md:col-span-2">
						<!-- Title -->
						<div class="space-y-2">
							<Label>Title</Label>
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
							<Label class="font-medium">Year</Label>
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
					</div>

					<!-- Artists -->
					<TableRecordArtists />

					<!-- Labels -->
					<div class="col-span-3 space-y-2">
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

				<SectionRecordTracks />
			</div>

			<!-- Dialog Footer (only shown in edit mode) -->
			<DialogFooter v-if="recordDetails.isEditMode" class="p-6 pt-0">
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
