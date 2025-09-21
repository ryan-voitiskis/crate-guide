<script setup lang="ts">
import { CheckCircle, Info, XCircle } from 'lucide-vue-next'

const tracks = useTracksStore()
const beatport = useBeatportStore()

const showDialog = ref(false)
const skipExistingData = ref(true)

const hasResults = computed(() => {
	const { successful, skipped, failed } = beatport.bulkBeatportResults
	return successful > 0 || skipped > 0 || failed.length > 0
})

const tracksToProcess = computed(() =>
	skipExistingData.value
		? tracks.tracks.filter((track) => !track.beatport_data).length
		: tracks.tracks.length
)

async function startBulkFetch() {
	await beatport.bulkFetchBeatportData(skipExistingData.value)
}

function closeDialog() {
	beatport.resetBulkState()
	showDialog.value = false
}

watch(showDialog, (isOpen) => isOpen && beatport.resetBulkState())

defineExpose({
	showDialog
})
</script>

<template>
	<Dialog v-model:open="showDialog">
		<DialogContent class="sm:max-w-[500px]">
			<DialogHeader>
				<DialogTitle>
					{{
						!beatport.isBulkFetchingBeatportData && hasResults
							? 'Beatport Import Results'
							: beatport.isBulkFetchingBeatportData
								? 'Fetching Beatport Data...'
								: 'Get Beatport Data'
					}}
				</DialogTitle>
				<p
					v-if="!beatport.isBulkFetchingBeatportData && !hasResults"
					class="text-muted-foreground text-sm"
				>
					This will search Beatport for BPM, key, and genre data for your
					tracks.
				</p>
				<p
					v-else-if="beatport.isBulkFetchingBeatportData"
					class="text-muted-foreground text-sm"
				>
					Please wait while we search Beatport for your tracks...
				</p>
			</DialogHeader>

			<div
				v-if="!beatport.isBulkFetchingBeatportData && !hasResults"
				class="space-y-4"
			>
				<div class="space-y-3 rounded-lg border p-4">
					<div class="flex items-start space-x-3">
						<Info class="mt-0.5 h-5 w-5 text-blue-500" />
						<div class="space-y-2">
							<p class="text-sm">
								<strong>What this does:</strong>
							</p>
							<ul
								class="text-muted-foreground ml-4 list-disc space-y-1 text-sm"
							>
								<li>Searches Beatport for each track using artist and title</li>
								<li>Auto-fills BPM if not already set</li>
								<li>Auto-fills key and mode if not already set</li>
								<li>Stores full Beatport data for future reference</li>
							</ul>
						</div>
					</div>
				</div>

				<div class="flex items-center space-x-2">
					<Checkbox id="skip-existing" v-model="skipExistingData" />
					<Label for="skip-existing" class="text-sm">
						Skip tracks that already have Beatport data
					</Label>
				</div>

				<div class="text-muted-foreground text-sm">
					{{ tracksToProcess }} tracks will be processed
				</div>
			</div>

			<div v-if="beatport.isBulkFetchingBeatportData" class="space-y-4">
				<Progress :model-value="beatport.bulkBeatportProgress" />
				<p class="text-muted-foreground text-center text-sm">
					{{ beatport.bulkBeatportProgress }}% complete ({{
						beatport.bulkBeatportResults.successful +
						beatport.bulkBeatportResults.failed.length
					}}/{{ beatport.bulkBeatportResults.total }})
				</p>
			</div>

			<ScrollArea class="max-h-80">
				<div
					v-if="!beatport.isBulkFetchingBeatportData && hasResults"
					class="space-y-4"
				>
					<div
						v-if="beatport.bulkBeatportResults.successful > 0"
						class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20"
					>
						<div class="flex items-center">
							<CheckCircle
								class="mr-2 h-5 w-5 text-green-600 dark:text-green-400"
							/>
							<span class="text-green-800 dark:text-green-300">
								Successfully updated
								{{ beatport.bulkBeatportResults.successful }}
								{{
									beatport.bulkBeatportResults.successful === 1
										? 'track'
										: 'tracks'
								}}
							</span>
						</div>
					</div>

					<div
						v-if="beatport.bulkBeatportResults.skipped > 0"
						class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20"
					>
						<div class="flex items-center">
							<Info class="mr-2 h-5 w-5 text-blue-600 dark:text-blue-400" />
							<span class="text-blue-800 dark:text-blue-300">
								Skipped {{ beatport.bulkBeatportResults.skipped }}
								{{
									beatport.bulkBeatportResults.skipped === 1
										? 'track'
										: 'tracks'
								}}
								(already have Beatport data)
							</span>
						</div>
					</div>

					<div
						v-if="beatport.bulkBeatportResults.failed.length > 0"
						class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20"
					>
						<div class="flex items-start">
							<XCircle
								class="mt-0.5 mr-2 h-5 w-5 text-red-600 dark:text-red-400"
							/>
							<div class="flex-1">
								<p class="mb-2 text-red-800 dark:text-red-300">
									Failed to find data for
									{{ beatport.bulkBeatportResults.failed.length }}
									{{
										beatport.bulkBeatportResults.failed.length === 1
											? 'track'
											: 'tracks'
									}}
								</p>
								<details class="text-sm">
									<summary
										class="cursor-pointer text-red-700 hover:underline dark:text-red-400"
									>
										Show details
									</summary>
									<ul class="mt-2 space-y-2">
										<li
											v-for="(failedTrack, index) in beatport
												.bulkBeatportResults.failed"
											:key="`failed-${index}`"
											class="text-gray-600 dark:text-gray-400"
										>
											<div class="font-medium">
												{{ failedTrack.title }}
											</div>
											<div class="text-xs text-red-600 dark:text-red-400">
												{{ failedTrack.error }}
											</div>
										</li>
									</ul>
								</details>
							</div>
						</div>
					</div>
				</div>
			</ScrollArea>

			<DialogFooter class="flex gap-2 pt-4">
				<Button
					v-if="!beatport.isBulkFetchingBeatportData"
					@click="closeDialog"
					variant="outline"
				>
					{{ hasResults ? 'Close' : 'Cancel' }}
				</Button>
				<Button
					v-if="beatport.isBulkFetchingBeatportData"
					@click="beatport.cancelBulkBeatportFetch"
					variant="outline"
				>
					Cancel
				</Button>
				<Button
					v-if="!beatport.isBulkFetchingBeatportData && !hasResults"
					@click="startBulkFetch"
					:disabled="tracksToProcess === 0"
				>
					Continue
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
