<script setup lang="ts">
import { FolderOpen, Plus } from 'lucide-vue-next'

const crates = useCratesStore()

const isActive = usePageActive()

// Dialog state
const showCreateDialog = ref(false)
const showDetailDialog = ref(false)
const showDeleteAlert = ref(false)
const showAddRecordsDialog = ref(false)

const selectedCrateId = ref<string | null>(null)
const crateToDelete = ref<Crate | null>(null)

// Compute selected crate from store so updates are reactive
const selectedCrate = computed(() =>
	selectedCrateId.value
		? (crates.getCrateById(selectedCrateId.value) ?? null)
		: null
)

function openCreateDialog() {
	showCreateDialog.value = true
}

function selectCrate(crate: Crate) {
	selectedCrateId.value = crate.id
	showDetailDialog.value = true
}

function handleDeleteFromDetail(crate: Crate) {
	crateToDelete.value = crate
	showDeleteAlert.value = true
}

function handleAddRecord() {
	showAddRecordsDialog.value = true
}

function handleCrateDeleted() {
	showDetailDialog.value = false
	selectedCrateId.value = null
	crateToDelete.value = null
}
</script>

<template>
	<div class="flex h-full flex-col">
		<DialogCrateForm v-model:open="showCreateDialog" />
		<DialogCrateDetails
			v-if="selectedCrate"
			v-model:open="showDetailDialog"
			:crate="selectedCrate"
			@delete="handleDeleteFromDetail"
			@addRecord="handleAddRecord"
		/>
		<DialogAddRecords
			v-if="selectedCrate"
			v-model:open="showAddRecordsDialog"
			:crate="selectedCrate"
		/>
		<AlertConfirmDeleteCrate
			v-if="crateToDelete"
			v-model:open="showDeleteAlert"
			:crate="crateToDelete"
			@confirm="handleCrateDeleted"
		/>

		<Teleport to="#header-left" defer>
			<template v-if="isActive && crates.hasCrates">
				<Button @click="openCreateDialog">
					<Plus class="mr-2" />
					Create Crate
				</Button>
			</template>
		</Teleport>

		<div class="scrollbar-hidden flex-1 overflow-y-auto">
			<div class="mx-auto max-w-[1600px] space-y-6 p-2">
				<StateLoading
					v-if="crates.isLoadingCrates"
					message="Loading crates..."
				/>

				<div v-else-if="crates.hasCrates" class="space-y-4">
					<div
						class="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3"
					>
						<CardCrate
							v-for="crate in crates.crates"
							:key="crate.id"
							:crate="crate"
							@select="selectCrate"
						/>
					</div>
				</div>

				<div
					v-else
					class="flex flex-col items-center justify-center py-16 text-center"
				>
					<div class="bg-muted mb-4 rounded-full p-6">
						<FolderOpen class="text-muted-foreground size-12" />
					</div>
					<h3 class="mb-2 text-lg font-semibold">No crates yet</h3>
					<p class="text-muted-foreground mb-6 max-w-sm">
						Create your first crate to organize records for gigs
					</p>
					<Button @click="openCreateDialog">
						<Plus class="mr-2" />
						Create Crate
					</Button>
				</div>
			</div>
		</div>
	</div>
</template>
