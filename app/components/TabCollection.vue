<script setup lang="ts">
import { Disc3 } from 'lucide-vue-next'

const user = useUserStore()
const discogs = useDiscogsStore()
const records = useRecordsStore()
const tracks = useTracksStore()
const crates = useCratesStore()
</script>

<template>
	<DialogCollectionImport />
	<DialogReleaseImportFilter />
	<DialogDiscogsImport />
	<DialogRecordDetails />
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
			<div class="flex">
				<InputRecordsSearch />
				<Button
					@click="discogs.showGetFoldersDialog = true"
					variant="secondary"
					class="ml-auto w-32"
					:disabled="!user.isDiscogsAuthenticated"
				>
					Import
					<IconDiscogs class="ml-2" />
				</Button>
			</div>

			<div
				v-if="!records.hasRecords"
				class="flex flex-col items-center justify-center gap-4 py-16 text-center"
			>
				<Disc3 class="text-secondary !size-12" />
				<h3 class="text-lg font-semibold">No records yet</h3>
				<p class="text-muted-foreground max-w-sm">
					2 Start building your collection by importing records from Discogs or
					adding them manually.
				</p>
				<Button
					@click="discogs.showGetFoldersDialog = true"
					variant="secondary"
					:disabled="!user.isDiscogsAuthenticated"
				>
					Import from Discogs
				</Button>
			</div>

			<StateNoSearchResults
				v-else-if="records.hasSearchQuery && !records.hasSearchResults"
			/>

			<div
				v-else
				class="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
			>
				<CardRecordShort
					v-for="record in records.displayedRecords"
					:key="record.id"
					:record="record"
				/>
			</div>
		</div>
	</div>

	<DialogCollectionImport />
	<DialogDiscogsImport />
</template>
