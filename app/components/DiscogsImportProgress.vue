<script setup lang="ts">
import { useDiscogsStore } from '~/stores/discogsStore'

const discogsStore = useDiscogsStore()
const router = useRouter()

const hasResults = computed(() => {
	const results = discogsStore.importResults
	return (
		results.successful > 0 ||
		results.skipped.length > 0 ||
		results.failed.length > 0
	)
})

const clearResults = () => {
	discogsStore.importResults = { successful: 0, skipped: [], failed: [] }
}

const viewCollection = () => {
	// Navigate to the collection/records page
	router.push('/records')
}
</script>

<template>
	<div class="discogs-import-progress">
		<!-- Progress Section -->
		<div v-if="discogsStore.isImporting" class="space-y-4">
			<h3 class="text-lg font-semibold">Importing Records...</h3>

			<div class="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
				<div
					class="h-2.5 rounded-full bg-blue-600 transition-all duration-300"
					:style="{ width: `${discogsStore.importProgress}%` }"
				></div>
			</div>

			<p class="text-sm text-gray-600 dark:text-gray-400">
				{{ discogsStore.importProgress }}% complete
			</p>
		</div>

		<!-- Results Section -->
		<div v-if="!discogsStore.isImporting && hasResults" class="space-y-4">
			<h3 class="text-lg font-semibold">Import Results</h3>

			<!-- Success Count -->
			<div
				v-if="discogsStore.importResults.successful > 0"
				class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20"
			>
				<div class="flex items-center">
					<Icon
						name="heroicons:check-circle"
						class="mr-2 h-5 w-5 text-green-600 dark:text-green-400"
					/>
					<span class="text-green-800 dark:text-green-300">
						Successfully imported {{ discogsStore.importResults.successful }}
						{{
							discogsStore.importResults.successful === 1 ? 'record' : 'records'
						}}
					</span>
				</div>
			</div>

			<!-- Skipped Records -->
			<div
				v-if="discogsStore.importResults.skipped.length > 0"
				class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20"
			>
				<div class="flex items-start">
					<Icon
						name="heroicons:information-circle"
						class="mt-0.5 mr-2 h-5 w-5 text-blue-600 dark:text-blue-400"
					/>
					<div class="flex-1">
						<p class="mb-2 text-blue-800 dark:text-blue-300">
							Skipped {{ discogsStore.importResults.skipped.length }}
							{{
								discogsStore.importResults.skipped.length === 1
									? 'record'
									: 'records'
							}}
							(already in collection)
						</p>
						<details
							v-if="discogsStore.importResults.skipped.length <= 10"
							class="text-sm"
						>
							<summary
								class="cursor-pointer text-blue-700 hover:underline dark:text-blue-400"
							>
								Show details
							</summary>
							<ul class="mt-2 space-y-1">
								<li
									v-for="(record, index) in discogsStore.importResults.skipped"
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
				v-if="discogsStore.importResults.failed.length > 0"
				class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20"
			>
				<div class="flex items-start">
					<Icon
						name="heroicons:x-circle"
						class="mt-0.5 mr-2 h-5 w-5 text-red-600 dark:text-red-400"
					/>
					<div class="flex-1">
						<p class="mb-2 text-red-800 dark:text-red-300">
							Failed to import {{ discogsStore.importResults.failed.length }}
							{{
								discogsStore.importResults.failed.length === 1
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
									v-for="(record, index) in discogsStore.importResults.failed"
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

			<!-- Action Buttons -->
			<div class="flex gap-2 pt-4">
				<button
					@click="clearResults"
					class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Clear Results
				</button>
				<button
					v-if="discogsStore.importResults.successful > 0"
					@click="viewCollection"
					class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
				>
					View Collection
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
details summary::-webkit-details-marker {
	display: none;
}

details[open] summary {
	margin-bottom: 0.5rem;
}
</style>
