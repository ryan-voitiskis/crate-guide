<script setup lang="ts">
import { CheckCircle, Info, Loader2, XCircle } from 'lucide-vue-next'

const tracks = useTracksStore()
const beatport = useBeatportStore()

const showDialog = ref(false)
const includeSearched = ref(false)

const hasResults = computed(() => {
	const { successful, skipped, failed } = beatport.bulkBeatportResults
	return successful > 0 || skipped > 0 || failed.length > 0
})

const unsearchedCount = computed(
	() =>
		tracks.tracks.filter(
			(track) => !beatport.hasBeenSearched(track.beatport_data)
		).length
)

const previouslySearchedCount = computed(
	() => tracks.tracks.length - unsearchedCount.value
)

const tracksToProcess = computed(() =>
	includeSearched.value ? tracks.tracks.length : unsearchedCount.value
)

const processedCount = computed(
	() =>
		beatport.bulkBeatportResults.successful +
		beatport.bulkBeatportResults.failed.length
)

async function startBulkFetch() {
	await beatport.bulkFetchBeatportData(includeSearched.value)
}

function closeDialog() {
	if (beatport.isBulkFetchingBeatportData) {
		beatport.cancelBulkBeatportFetch()
	}
	showDialog.value = false
}

watch(showDialog, (isOpen) => {
	if (isOpen) {
		beatport.resetBulkState()
	} else if (beatport.isBulkFetchingBeatportData) {
		beatport.cancelBulkBeatportFetch()
	}
})

defineExpose({
	showDialog
})
</script>

<template>
	<Dialog v-model:open="showDialog">
		<DialogContent class="sm:max-w-[480px]">
			<DialogHeader>
				<DialogTitle>
					{{
						!beatport.isBulkFetchingBeatportData && hasResults
							? 'Import Complete'
							: beatport.isBulkFetchingBeatportData
								? 'Importing from Beatport'
								: 'Get Beatport Data for All Tracks'
					}}
				</DialogTitle>
			</DialogHeader>

			<!-- Initial State: Before starting -->
			<div
				v-if="!beatport.isBulkFetchingBeatportData && !hasResults"
				class="space-y-4"
			>
				<p class="text-muted-foreground text-sm">
					Search Beatport for BPM, key, and genre data for your tracks.
				</p>

				<div
					v-if="previouslySearchedCount > 0"
					class="flex items-center space-x-2"
				>
					<Checkbox id="include-searched" v-model="includeSearched" />
					<Label for="include-searched" class="text-sm">
						Re-search {{ previouslySearchedCount }} previously searched
						{{ previouslySearchedCount === 1 ? 'track' : 'tracks' }}
					</Label>
				</div>

				<div
					class="text-muted-foreground rounded-md border px-3 py-2 text-center text-sm"
				>
					{{ tracksToProcess }} tracks to process
				</div>
			</div>

			<!-- Processing State: During fetch -->
			<div v-if="beatport.isBulkFetchingBeatportData" class="space-y-4">
				<!-- Progress bar and counts -->
				<div class="space-y-2">
					<Progress :model-value="beatport.bulkBeatportProgress" />
					<div class="flex justify-between text-xs">
						<span class="text-muted-foreground">
							{{ processedCount }} / {{ beatport.bulkBeatportResults.total }}
						</span>
						<div class="flex gap-3">
							<span class="text-green-600 dark:text-green-400">
								{{ beatport.bulkBeatportResults.successful }} found
							</span>
							<span class="text-red-600 dark:text-red-400">
								{{ beatport.bulkBeatportResults.failed.length }} failed
							</span>
						</div>
					</div>
				</div>

				<!-- Current track being processed -->
				<div
					v-if="beatport.currentProcessingTrack"
					class="flex items-center gap-3 rounded-md border p-3"
				>
					<Loader2
						class="text-muted-foreground h-4 w-4 shrink-0 animate-spin"
					/>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">
							{{ beatport.currentProcessingTrack.title }}
						</p>
						<p class="text-muted-foreground truncate text-xs">
							{{ beatport.currentProcessingTrack.artist }}
						</p>
					</div>
				</div>

				<!-- Last processed result -->
				<div
					v-if="beatport.lastProcessedTrack"
					class="overflow-hidden rounded-md bg-zinc-900"
				>
					<div v-if="beatport.lastProcessedTrack.image" class="w-full">
						<img
							:src="beatport.lastProcessedTrack.image"
							:alt="beatport.lastProcessedTrack.title"
							class="h-auto w-full"
						/>
					</div>
					<div class="flex items-center gap-2 p-3">
						<component
							:is="beatport.lastProcessedTrack.success ? CheckCircle : XCircle"
							class="h-4 w-4 shrink-0"
							:class="
								beatport.lastProcessedTrack.success
									? 'text-green-400'
									: 'text-red-400'
							"
						/>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-zinc-100">
								{{ beatport.lastProcessedTrack.title }}
							</p>
							<p
								class="truncate text-xs"
								:class="
									beatport.lastProcessedTrack.success
										? 'text-green-300'
										: 'text-red-300'
								"
							>
								{{
									beatport.lastProcessedTrack.success
										? beatport.lastProcessedTrack.artist
										: beatport.lastProcessedTrack.error
								}}
							</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Results State: After completion -->
			<div
				v-if="!beatport.isBulkFetchingBeatportData && hasResults"
				class="space-y-3"
			>
				<!-- Summary stats -->
				<div class="grid grid-cols-2 gap-3">
					<div
						v-if="beatport.bulkBeatportResults.successful > 0"
						class="flex items-center gap-2 rounded-md bg-green-50 p-3 dark:bg-green-900/20"
					>
						<CheckCircle class="h-5 w-5 text-green-600 dark:text-green-400" />
						<div>
							<p class="text-sm font-medium text-green-800 dark:text-green-200">
								{{ beatport.bulkBeatportResults.successful }}
							</p>
							<p class="text-xs text-green-700 dark:text-green-300">found</p>
						</div>
					</div>

					<div
						v-if="beatport.bulkBeatportResults.failed.length > 0"
						class="flex items-center gap-2 rounded-md bg-red-50 p-3 dark:bg-red-900/20"
					>
						<XCircle class="h-5 w-5 text-red-600 dark:text-red-400" />
						<div>
							<p class="text-sm font-medium text-red-800 dark:text-red-200">
								{{ beatport.bulkBeatportResults.failed.length }}
							</p>
							<p class="text-xs text-red-700 dark:text-red-300">not found</p>
						</div>
					</div>

					<div
						v-if="beatport.bulkBeatportResults.skipped > 0"
						class="flex items-center gap-2 rounded-md bg-blue-50 p-3 dark:bg-blue-900/20"
					>
						<Info class="h-5 w-5 text-blue-600 dark:text-blue-400" />
						<div>
							<p class="text-sm font-medium text-blue-800 dark:text-blue-200">
								{{ beatport.bulkBeatportResults.skipped }}
							</p>
							<p class="text-xs text-blue-700 dark:text-blue-300">skipped</p>
						</div>
					</div>
				</div>

				<!-- Failed tracks details (collapsed by default) -->
				<details
					v-if="beatport.bulkBeatportResults.failed.length > 0"
					class="rounded-md border"
				>
					<summary
						class="text-muted-foreground hover:bg-accent cursor-pointer px-3 py-2 text-sm"
					>
						Show failed tracks
					</summary>
					<ScrollArea class="max-h-48">
						<ul class="divide-y px-3">
							<li
								v-for="failedTrack in beatport.bulkBeatportResults.failed"
								:key="failedTrack.trackId"
								class="py-2"
							>
								<p class="truncate text-sm">{{ failedTrack.title }}</p>
								<p class="text-muted-foreground truncate text-xs">
									{{ failedTrack.error }}
								</p>
							</li>
						</ul>
					</ScrollArea>
				</details>
			</div>

			<DialogFooter class="flex gap-2 pt-2">
				<Button
					v-if="beatport.isBulkFetchingBeatportData"
					variant="outline"
					@click="beatport.cancelBulkBeatportFetch"
				>
					Cancel
				</Button>
				<Button v-else-if="hasResults" @click="closeDialog">Done</Button>
				<template v-else>
					<Button variant="outline" @click="closeDialog">Cancel</Button>
					<Button :disabled="tracksToProcess === 0" @click="startBulkFetch">
						Start
					</Button>
				</template>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
