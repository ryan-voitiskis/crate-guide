<script setup lang="ts">
import {
	CheckCircle,
	ChevronDown,
	Info,
	Minimize2,
	XCircle
} from 'lucide-vue-next'

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

const monitorTitle = computed(() => {
	if (discogs.transferStatus === 'cancelled') return 'Import cancelled'
	if (discogs.transferStatus === 'failed') return 'Import interrupted'
	if (discogs.transferStatus === 'completed') return 'Import results'
	return discogs.importPhase === 'saving'
		? 'Writing records…'
		: 'Importing records…'
})

const monitorDescription = computed(() => {
	if (discogs.transferStatus === 'cancelled') {
		return 'The transfer stopped before the remaining records were imported.'
	}
	if (discogs.transferStatus === 'failed') {
		return 'The transfer could not finish. Review the details before trying again.'
	}
	if (discogs.transferStatus === 'completed') {
		return 'Review the completed Discogs transfer.'
	}
	return discogs.importPhase === 'saving'
		? 'Writing fetched releases and tracks to your library.'
		: 'Fetching release metadata from Discogs.'
})

function handleOpenChange(open: boolean) {
	if (open) {
		discogs.openTransferMonitor()
		return
	}
	if (discogs.isImporting) discogs.minimizeTransferMonitor()
	else discogs.dismissTransferMonitor()
}
</script>

<template>
	<Dialog
		:open="discogs.showImportProgressDialog"
		@update:open="handleOpenChange"
	>
		<DialogContent
			class="gap-4 rounded-sm sm:max-w-lg"
			:hide-close="discogs.isImporting"
			@interact-outside="(e) => discogs.isImporting && e.preventDefault()"
			@escape-key-down="(e) => discogs.isImporting && e.preventDefault()"
		>
			<div
				class="text-muted-foreground font-mono text-[9px] tracking-[0.18em] uppercase"
			>
				Discogs / Transfer monitor
			</div>
			<DialogHeader>
				<DialogTitle class="text-base tracking-tight">
					{{ monitorTitle }}
				</DialogTitle>
				<DialogDescription class="text-muted-foreground text-sm">
					{{ monitorDescription }}
				</DialogDescription>
			</DialogHeader>
			<ProgressDiscogsImport />

			<ScrollArea class="max-h-80">
				<div
					v-if="!discogs.isImporting && discogs.transferStatus === 'cancelled'"
					class="border-border bg-workbench-inset mb-2 flex items-start gap-2 rounded-sm border p-3"
				>
					<Info class="text-primary mt-0.5 size-4 shrink-0" />
					<p class="text-muted-foreground text-sm">
						You can start a new transfer from the collection import menu.
					</p>
				</div>
				<div
					v-else-if="
						!discogs.isImporting &&
						discogs.transferStatus === 'completed' &&
						!hasResults
					"
					class="border-border bg-card mb-2 flex items-start gap-2 rounded-sm border p-3"
				>
					<CheckCircle
						class="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
					/>
					<p class="text-sm">
						Transfer complete. No library changes were needed.
					</p>
				</div>
				<div v-if="!discogs.isImporting && hasResults" class="space-y-2">
					<!-- Success Count -->
					<div
						v-if="discogs.importResults.successful > 0"
						class="border-border bg-card rounded-sm border p-3"
					>
						<div class="flex items-center gap-2">
							<CheckCircle
								class="size-4 text-emerald-600 dark:text-emerald-400"
							/>
							<span class="text-sm">
								Imported
								<strong class="font-mono tabular-nums">
									{{ discogs.importResults.successful }}
								</strong>
								{{
									discogs.importResults.successful === 1 ? 'record' : 'records'
								}}
							</span>
						</div>
					</div>

					<div
						v-if="discogs.importResults.skipped.length > 0"
						class="border-border bg-card rounded-sm border p-3"
					>
						<div class="flex items-start">
							<Info class="text-primary mt-0.5 mr-2 size-4" />
							<p class="mb-2 text-sm">
								Skipped
								<strong class="font-mono tabular-nums">
									{{ discogs.importResults.skipped.length }}
								</strong>
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
								<Button
									variant="blank"
									class="text-muted-foreground hover:text-foreground h-auto p-0 text-xs"
								>
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
									class="text-muted-foreground border-border border-t pt-1.5 text-xs first:border-t-0 first:pt-0"
								>
									{{ record.label }}
								</div>
							</CollapsibleContent>
						</Collapsible>
					</div>

					<!-- Failed Records -->
					<div
						v-if="discogs.importResults.failed.length > 0"
						class="border-destructive/25 bg-destructive/5 rounded-sm border p-3"
					>
						<div class="flex items-start">
							<XCircle class="text-destructive mt-0.5 mr-2 size-4" />
							<div class="flex-1">
								<p class="text-destructive mb-2 text-sm">
									Failed to import {{ discogs.importResults.failed.length }}
									{{
										discogs.importResults.failed.length === 1
											? 'record'
											: 'records'
									}}
								</p>
								<details class="text-sm">
									<summary
										class="text-destructive cursor-pointer text-xs hover:underline"
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
				<div
					class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end"
				>
					<Button
						v-if="discogs.importPhase === 'fetching'"
						variant="destructive"
						@click="discogs.cancelImport()"
					>
						Cancel import
					</Button>
					<Button
						v-if="discogs.isImporting"
						variant="secondary"
						@click="discogs.minimizeTransferMonitor()"
					>
						<Minimize2 />
						Minimise
					</Button>
					<Button
						v-else
						variant="secondary"
						@click="discogs.dismissTransferMonitor()"
					>
						Close
					</Button>
				</div>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
