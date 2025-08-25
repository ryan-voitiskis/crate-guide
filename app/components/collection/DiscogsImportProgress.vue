<script setup lang="ts">
const discogs = useDiscogsStore()

const hasResults = computed(() => {
	const results = discogs.importResults
	return (
		results.successful > 0 ||
		results.skipped.length > 0 ||
		results.failed.length > 0
	)
})
</script>

<template>
	<Dialog v-model:open="discogs.showImportProgressDialog">
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle>
					{{
						!discogs.isImporting && hasResults
							? 'Importing Records...'
							: 'Import Results'
					}}
				</DialogTitle>
				<p v-if="discogs.isImporting" class="text-muted-foreground text-sm">
					Hold tight while we import your records.
				</p>
			</DialogHeader>
			<div v-if="discogs.isImporting" class="space-y-4">
				<div class="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
					<div
						class="h-2.5 rounded-full bg-blue-600 transition-all duration-300"
						:style="{ width: `${discogs.importProgress}%` }"
					></div>
				</div>

				<p class="text-sm text-gray-600 dark:text-gray-400">
					{{ discogs.importProgress }}% complete
				</p>
			</div>

			<!-- Results Section -->
			<div v-if="!discogs.isImporting && hasResults" class="space-y-4">
				<!-- Success Count -->
				<div
					v-if="discogs.importResults.successful > 0"
					class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20"
				>
					<div class="flex items-center">
						<Icon
							name="heroicons:check-circle"
							class="mr-2 h-5 w-5 text-green-600 dark:text-green-400"
						/>
						<span class="text-green-800 dark:text-green-300">
							Successfully imported {{ discogs.importResults.successful }}
							{{
								discogs.importResults.successful === 1 ? 'record' : 'records'
							}}
						</span>
					</div>
				</div>

				<!-- Skipped Records -->
				<div
					v-if="discogs.importResults.skipped.length > 0"
					class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20"
				>
					<div class="flex items-start">
						<Icon
							name="heroicons:information-circle"
							class="mt-0.5 mr-2 h-5 w-5 text-blue-600 dark:text-blue-400"
						/>
						<div class="flex-1">
							<p class="mb-2 text-blue-800 dark:text-blue-300">
								Skipped {{ discogs.importResults.skipped.length }}
								{{
									discogs.importResults.skipped.length === 1
										? 'record'
										: 'records'
								}}
								(already in collection)
							</p>
							<details
								v-if="discogs.importResults.skipped.length <= 10"
								class="text-sm"
							>
								<summary
									class="cursor-pointer text-blue-700 hover:underline dark:text-blue-400"
								>
									Show details
								</summary>
								<ul class="mt-2 space-y-1">
									<li
										v-for="(record, index) in discogs.importResults.skipped"
										:key="`skipped-${index}`"
										class="text-gray-600 dark:text-gray-400"
									>
										{{ record.artists }} - {{ record.title }}
									</li>
								</ul>
							</details>
							<p v-else class="text-sm text-gray-600 dark:text-gray-400">
								Too many to display
							</p>
						</div>
					</div>
				</div>

				<!-- Failed Records -->
				<div
					v-if="discogs.importResults.failed.length > 0"
					class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20"
				>
					<div class="flex items-start">
						<Icon
							name="heroicons:x-circle"
							class="mt-0.5 mr-2 h-5 w-5 text-red-600 dark:text-red-400"
						/>
						<div class="flex-1">
							<p class="mb-2 text-red-800 dark:text-red-300">
								Failed to import {{ discogs.importResults.failed.length }}
								{{
									discogs.importResults.failed.length === 1
										? 'record'
										: 'records'
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
										v-for="(record, index) in discogs.importResults.failed"
										:key="`failed-${index}`"
										class="text-gray-600 dark:text-gray-400"
									>
										<div class="font-medium">
											{{ record.artists }} - {{ record.title }}
										</div>
										<div class="text-xs text-red-600 dark:text-red-400">
											Error: {{ record.error }}
										</div>
									</li>
								</ul>
							</details>
						</div>
					</div>
				</div>
			</div>

			<DialogFooter>
				<div class="flex gap-2 pt-4">
					<Button
						@click="discogs.showImportProgressDialog = false"
						variant="secondary"
					>
						Close
					</Button>
				</div>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>

<style scoped>
details summary::-webkit-details-marker {
	display: none;
}

details[open] summary {
	margin-bottom: 0.5rem;
}
</style>
