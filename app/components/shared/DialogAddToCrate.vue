<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Check, Plus } from 'lucide-vue-next'

const recordDetails = useRecordDetailsStore()
const cratesStore = useCratesStore()

const record = computed(() => recordDetails.recordToAddToCrate)
const isOpen = computed(() => !!record.value)

// Track which crates are currently selected (checked) - use array for Vue reactivity
const selectedCrateIds = ref<string[]>([])
// Track initial state to calculate changes
const initialCrateIds = ref<string[]>([])

const showCreateCrateDialog = ref(false)
const isSaving = ref(false)

// Initialize selected crates when dialog opens
watch(
	() => record.value,
	(newRecord) => {
		if (newRecord) {
			const containingCrates = cratesStore.getCratesContainingRecord(
				newRecord.id
			)
			const ids = containingCrates.map((c) => c.id)
			selectedCrateIds.value = [...ids]
			initialCrateIds.value = [...ids]
		} else {
			// Reset when dialog closes
			selectedCrateIds.value = []
			initialCrateIds.value = []
		}
	},
	{ immediate: true }
)

function isSelected(crateId: string): boolean {
	return selectedCrateIds.value.includes(crateId)
}

function toggleCrate(crateId: string) {
	const index = selectedCrateIds.value.indexOf(crateId)
	if (index >= 0) {
		selectedCrateIds.value.splice(index, 1)
	} else {
		selectedCrateIds.value.push(crateId)
	}
}

async function handleSave() {
	if (!record.value) return

	isSaving.value = true
	const recordId = record.value.id

	try {
		// Calculate additions and removals
		const toAdd = selectedCrateIds.value.filter(
			(id) => !initialCrateIds.value.includes(id)
		)
		const toRemove = initialCrateIds.value.filter(
			(id) => !selectedCrateIds.value.includes(id)
		)

		let successfulAdditions = 0
		let successfulRemovals = 0

		// Perform all operations
		for (const crateId of toAdd) {
			const added = await cratesStore.addRecordToCrate(crateId, recordId, {
				silent: true
			})
			if (added) successfulAdditions += 1
		}
		for (const crateId of toRemove) {
			const removed = await cratesStore.removeRecordFromCrate(crateId, recordId)
			if (removed) successfulRemovals += 1
		}

		// Show summary toast
		if (successfulAdditions > 0 || successfulRemovals > 0) {
			const messages: string[] = []
			if (successfulAdditions > 0) {
				messages.push(
					`Added to ${successfulAdditions} crate${successfulAdditions > 1 ? 's' : ''}`
				)
			}
			if (successfulRemovals > 0) {
				messages.push(
					`Removed from ${successfulRemovals} crate${successfulRemovals > 1 ? 's' : ''}`
				)
			}
			toast.success(messages.join(', '))
		}

		recordDetails.recordToAddToCrate = null
	} finally {
		isSaving.value = false
	}
}

function handleCancel() {
	recordDetails.recordToAddToCrate = null
}

function handleCrateCreated(crate: Crate) {
	// Auto-check the newly created crate
	if (!selectedCrateIds.value.includes(crate.id)) {
		selectedCrateIds.value.push(crate.id)
	}
}
</script>

<template>
	<Dialog :open="isOpen">
		<DialogContent class="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>Manage Crates</DialogTitle>
				<DialogDescription class="sr-only">
					Add or remove this record from your crates.
				</DialogDescription>
			</DialogHeader>

			<!-- Record info -->
			<div v-if="record" class="flex items-center gap-3">
				<ImageRecordCover :record="record" class="size-12 shrink-0 rounded" />
				<div class="min-w-0">
					<p class="truncate text-sm font-medium">{{ record.title }}</p>
					<p
						v-if="record.labels[0]?.catno"
						class="text-muted-foreground truncate text-xs"
					>
						{{ record.labels[0].catno }}
					</p>
				</div>
			</div>

			<div class="space-y-4">
				<!-- No crates state -->
				<div
					v-if="!cratesStore.hasCrates"
					class="flex flex-col items-center py-6 text-center"
				>
					<p class="text-muted-foreground mb-4">No crates yet</p>
					<Button @click="showCreateCrateDialog = true">
						<Plus class="mr-2 size-4" />
						Create Crate
					</Button>
				</div>

				<!-- Crate list -->
				<ScrollArea v-else class="max-h-75">
					<div class="space-y-1">
						<div
							v-for="crate in cratesStore.crates"
							:key="crate.id"
							class="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md px-3 py-2"
							@click="toggleCrate(crate.id)"
						>
							<div
								class="border-input flex size-4 shrink-0 items-center justify-center rounded-md border shadow-xs"
								:class="
									isSelected(crate.id)
										? 'bg-primary border-primary text-primary-foreground'
										: ''
								"
							>
								<Check v-if="isSelected(crate.id)" class="size-3" />
							</div>
							<div
								v-if="crate.color"
								class="size-3 shrink-0 rounded-full"
								:style="{ backgroundColor: crate.color }"
							/>
							<span class="truncate text-sm">{{ crate.name }}</span>
						</div>
					</div>
				</ScrollArea>

				<!-- Create new crate button -->
				<Button
					v-if="cratesStore.hasCrates"
					variant="outline"
					class="w-full"
					@click="showCreateCrateDialog = true"
				>
					<Plus class="mr-2 size-4" />
					Create new crate
				</Button>
			</div>

			<DialogFooter class="gap-2">
				<Button variant="secondary" @click="handleCancel">Cancel</Button>
				<ButtonLoading :loading="isSaving" @click="handleSave">
					Save
				</ButtonLoading>
			</DialogFooter>
		</DialogContent>
	</Dialog>

	<!-- Nested create crate dialog -->
	<DialogCrateForm
		v-model:open="showCreateCrateDialog"
		@saved="handleCrateCreated"
	/>
</template>
