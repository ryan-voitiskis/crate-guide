<script setup lang="ts">
import { CloudDownload, KeyRound, Plus } from 'lucide-vue-next'

const user = useUserStore()
const discogs = useDiscogsStore()
const discogsAuth = useDiscogsAuthStore()
const records = useRecordsStore()
const tracks = useTracksStore()
const crates = useCratesStore()
</script>

<template>
	<DialogCollectionImport />
	<DialogReleaseImportFilter />
	<DialogDiscogsImport />
	<DialogRecordDetails />

	<div class="flex h-full flex-col space-y-6 p-2">
		<div
			v-if="
				records.isLoadingRecords ||
				tracks.isLoadingTracks ||
				crates.isLoadingCrates
			"
			class="flex items-center justify-center py-8"
		>
			<div class="flex items-center gap-4">
				<div
					class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
				/>
				<span>Loading collection...</span>
			</div>
		</div>

		<div v-else-if="records.hasRecords" class="space-y-4">
			<div class="flex gap-2">
				<InputRecordsSearch />
				<Button
					@click="discogs.showGetFoldersDialog = true"
					variant="secondary"
				>
					<CloudDownload class="mr-2" />
					Import
				</Button>
			</div>
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

		<div v-else-if="discogsAuth.isOAuthed">
			<div
				class="mx-auto flex max-w-sm flex-col items-center justify-center py-16 text-center"
			>
				<h3 class="mb-2 text-lg font-semibold">Import from Discogs</h3>
				<p class="text-muted-foreground mb-6 max-w-sm">
					Import your record collection from Discogs.
				</p>

				<Button
					@click="discogs.showGetFoldersDialog = true"
					class="mb-2 w-full"
				>
					<CloudDownload class="mr-2" />
					Import
				</Button>
				or
				<!-- TODO: Add manual record creation -->
				<Button variant="secondary" class="mt-2 w-full">
					<Plus class="mr-2" />
					Add manually
				</Button>
			</div>
		</div>

		<div
			v-else
			class="mx-auto flex max-w-sm flex-col items-center justify-center py-16 text-center"
		>
			<h3 class="mb-2 text-lg font-semibold">Connect to Discogs</h3>
			<p class="text-muted-foreground mb-6 max-w-sm">
				Import your record collection from Discogs.
			</p>

			<Button
				class="mb-2 w-full"
				@click="discogsAuth.initDiscogsOAuthFlow"
				:loading="discogsAuth.isDiscogsConnecting"
			>
				<KeyRound class="mr-2" />
				Connect to Discogs
			</Button>

			<span>or</span>
			<!-- TODO: Add manual record creation -->
			<Button variant="secondary" class="mt-2 w-full">
				<Plus class="mr-2" />
				Add manually
			</Button>
		</div>
	</div>
</template>
