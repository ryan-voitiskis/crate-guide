<script setup lang="ts">
import { toast } from 'vue-sonner'

const userData = useUserData()
const user = useUserStore()
const discogs = useDiscogsStore()
const records = useRecordsStore()
const tracks = useTracksStore()
const crates = useCratesStore()

const selectedRecord = ref<DatabaseRecord | null>(null)

const hasRecords = computed(() => records.hasRecords)
const recordsCount = computed(() => records.recordsCount)

function handleRecordSelect(record: DatabaseRecord) {
	selectedRecord.value = record
	// TODO: Open record details dialog or navigate to detail view
	toast.success(`Selected: ${record.title}`)
}

function handleRecordEdit(record: DatabaseRecord) {
	// TODO: Open record edit dialog
	toast.info(`Edit: ${record.title}`)
}

async function handleRecordDelete(record: DatabaseRecord) {
	if (confirm(`Are you sure you want to delete "${record.title}"?`)) {
		await records.deleteRecord(record.id)
	}
}
</script>

<template>
	<DialogCollectionImport />
	<DialogReleaseImportFilter />
	<DialogDiscogsImport />
	<div class="flex h-full flex-col space-y-6 p-6">
		<div
			v-if="
				records.isLoadingRecords ||
				tracks.isLoadingTracks ||
				crates.isLoadingCrates
			"
			class="flex items-center justify-center py-8"
		>
			<div class="flex items-center gap-2">
				<div
					class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
				/>
				<span>Loading your collection...</span>
			</div>
		</div>

		<div v-else class="flex-1 space-y-6">
			<InputRecordsSearch />
			<Button
				@click="discogs.showGetFoldersDialog = true"
				variant="secondary"
				class="ml-auto"
				:disabled="!user.isDiscogsAuthenticated"
			>
				Import Discogs Collection
			</Button>

			<div
				v-if="!hasRecords"
				class="flex flex-col items-center justify-center py-16 text-center"
			>
				<div class="bg-muted mb-4 rounded-full p-6">
					<div class="text-muted-foreground text-4xl">♫</div>
				</div>
				<h3 class="text-lg font-semibold">No records yet</h3>
				<p class="text-muted-foreground mb-6 max-w-md">
					Start building your collection by importing records from Discogs or
					adding them manually.
				</p>
				<div class="flex gap-2">
					<DialogCollectionImport />
					<DialogDiscogsImport />
				</div>
			</div>

			<StateNoSearchResults
				v-else-if="records.hasSearchQuery && !records.hasSearchResults"
			/>

			<div
				v-else
				class="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
			>
				<CardRecordVinyl
					v-for="record in records.displayedRecords"
					:key="record.id"
					:record="record"
					:show-controls="true"
					@select="handleRecordSelect"
					@edit="handleRecordEdit"
					@delete="handleRecordDelete"
				/>
			</div>
		</div>
	</div>
</template>
