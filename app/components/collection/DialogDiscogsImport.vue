<script setup lang="ts">
import { CheckCircle, ChevronDown, Info, XCircle } from 'lucide-vue-next'

const discogs = useDiscogsStore()

const showSkipped = ref(false)

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
		<DialogContent
			class="sm:max-w-[425px]"
			:hide-close="discogs.isImporting"
			@interact-outside="(e) => discogs.isImporting && e.preventDefault()"
			@escape-key-down="(e) => discogs.isImporting && e.preventDefault()"
		>
			<DialogHeader>
				<DialogTitle>
					{{
						discogs.importPhase === 'saving'
							? 'Saving Records...'
							: !discogs.isImporting && hasResults
								? 'Import Results'
								: 'Importing Records...'
					}}
				</DialogTitle>
				<p v-if="discogs.importPhase === 'fetching'" class="text-muted-foreground text-sm">
					Hold tight while we import your records.
				</p>
				<p v-else-if="discogs.importPhase === 'saving'" class="text-muted-foreground text-sm">
					Saving records to your collection...
				</p>
			</DialogHeader>
			<ProgressDiscogsImport />

			<ScrollArea class="max-h-80">
				<div v-if="!discogs.isImporting && hasResults" class="space-y-4">
					<!-- Success Count -->
					<div
						v-if="discogs.importResults.successful > 0"
						class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20"
					>
						<div class="flex items-center">
							<CheckCircle
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

					<div
						class="flex flex-col items-start text-blue-900"
						v-if="discogs.importResults.skipped.length > 0"
					>
						<div class="flex items-start">
							<Info class="mt-0.5 mr-2 h-5 w-5" />
							<p class="mb-2">
								Skipped {{ discogs.importResults.skipped.length }}
								{{
									discogs.importResults.skipped.length === 1
										? 'record'
										: 'records'
								}}
								(already in collection)
							</p>
						</div>
						<Collapsible v-model:open="showSkipped" class="space-y-2">
							<CollapsibleTrigger as-child>
								<Button variant="blank" class="p-0">
									Show details
									<ChevronDown
										class="transition-all"
										:class="{ 'scale-y-[-1]': showSkipped }"
									/>
								</Button>
							</CollapsibleTrigger>
							<CollapsibleContent class="space-y-2">
								<div
									v-for="(record, index) in discogs.importResults.skipped"
									:key="`skipped-${index}`"
									class="text-xs"
								>
									{{ record.label }}
								</div>
							</CollapsibleContent>
						</Collapsible>
					</div>

					<!-- Failed Records -->
					<div
						v-if="discogs.importResults.failed.length > 0"
						class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20"
					>
						<div class="flex items-start">
							<XCircle
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
												{{ record.label }}
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
			</ScrollArea>

			<DialogFooter>
				<div class="flex gap-2 pt-4">
					<Button
						v-if="discogs.importPhase === 'fetching'"
						variant="destructive"
						@click="discogs.cancelImport()"
					>
						Cancel Import
					</Button>
					<Button
						v-else-if="!discogs.isImporting"
						variant="secondary"
						@click="discogs.showImportProgressDialog = false"
					>
						Close
					</Button>
				</div>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
