<script setup lang="ts">
import { CloudDownload, KeyRound, Plus } from 'lucide-vue-next'

const discogs = useDiscogsStore()
const discogsAuth = useDiscogsAuthStore()
const manualEntry = useManualRecordEntryStore()
const records = useRecordsStore()
const tracks = useTracksStore()
const crates = useCratesStore()

const isActive = usePageActive()

const discogsImportLabel = computed(() =>
	discogsAuth.isOAuthed ? 'Import' : 'Connect Discogs'
)

function handleDiscogsImport() {
	if (discogsAuth.isOAuthed) {
		discogs.showGetFoldersDialog = true
		return
	}

	discogsAuth.initDiscogsOAuthFlow()
}
</script>

<template>
	<div class="flex h-full flex-col">
		<DialogAddToCrate />
		<AlertConfirmRemoveRecord />

		<Teleport to="#header-left" defer>
			<template v-if="isActive && records.hasRecords">
				<InputRecordsSearch />
				<Button
					variant="secondary"
					:loading="discogsAuth.isDiscogsConnecting"
					@click="handleDiscogsImport"
				>
					<CloudDownload v-if="discogsAuth.isOAuthed" class="mr-2" />
					<KeyRound v-else class="mr-2" />
					{{ discogsImportLabel }}
				</Button>
				<Button variant="outline" @click="manualEntry.openDialog">
					<Plus class="mr-2" />
					Add manually
				</Button>
			</template>
		</Teleport>

		<div class="scrollbar-hidden flex-1 overflow-y-auto">
			<div class="mx-auto max-w-[1600px] space-y-6 p-2">
				<StateLoading
					v-if="
						records.isLoadingRecords ||
						tracks.isLoadingTracks ||
						crates.isLoadingCrates
					"
					message="Loading collection..."
				/>

				<div v-else-if="records.hasRecords" class="space-y-4">
					<DetailResultsCount class="flex items-center justify-between" />
					<div class="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
						<CardRecordShort
							v-for="record in records.displayedRecords"
							:key="record.id"
							:record="record"
						/>
					</div>
					<StateNoSearchResults
						v-if="records.hasSearchQuery && !records.hasSearchResults"
					/>
				</div>

				<StateEmptyCollection
					v-else
					icon="records"
					title="Start your record library"
					description="Import your Discogs collection in one pass, or add records manually."
				/>
			</div>
		</div>
	</div>
</template>
