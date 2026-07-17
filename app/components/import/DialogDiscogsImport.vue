<script setup lang="ts">
import {
	CheckCircle,
	ChevronDown,
	Info,
	Minimize2,
	RotateCcw,
	XCircle
} from 'lucide-vue-next'

const discogs = useDiscogsStore()

const showSkipped = ref(false)
const showFailures = ref(true)

const hasResults = computed(() => {
	const results = discogs.importResults
	return (
		results.successful > 0 ||
		results.skipped.length > 0 ||
		results.failed.length > 0
	)
})

const monitorTitle = computed(() => {
	if (discogs.transferStatus === 'cancelled') {
		return discogs.transferMode === 'retry'
			? 'Retry cancelled'
			: 'Import cancelled'
	}
	if (discogs.transferStatus === 'failed') {
		return discogs.transferMode === 'retry'
			? 'Retry interrupted'
			: 'Import interrupted'
	}
	if (discogs.transferStatus === 'completed') {
		if (discogs.transferMode === 'retry') return 'Retry results'
		if (discogs.importResults.failed.length > 0) {
			return 'Import completed with issues'
		}
		return 'Import results'
	}
	if (discogs.transferMode === 'retry') return 'Retrying failed records…'
	return discogs.importPhase === 'saving'
		? 'Writing records…'
		: 'Importing records…'
})

const monitorDescription = computed(() => {
	if (discogs.transferStatus === 'cancelled') {
		return discogs.transferMode === 'retry'
			? 'The retry stopped before every failed record could be checked.'
			: 'The transfer stopped before the remaining records were imported.'
	}
	if (discogs.transferStatus === 'failed') {
		return discogs.transferMode === 'retry'
			? 'The retry could not finish. Your previous transfer results are preserved.'
			: 'The transfer could not finish. Review the details before trying again.'
	}
	if (discogs.transferStatus === 'completed') {
		if (discogs.retrySummary) {
			return discogs.retrySummary.remaining === 0
				? 'Every failed record recovered successfully.'
				: 'Review the records that still need attention.'
		}
		return discogs.importResults.failed.length > 0
			? 'Most records imported successfully. Review or retry the remaining issues.'
			: 'Review the completed Discogs transfer.'
	}
	if (discogs.transferMode === 'retry') {
		return discogs.importPhase === 'saving'
			? 'Writing recovered records and tracks to your library.'
			: 'Refetching only the records that previously failed.'
	}
	return discogs.importPhase === 'saving'
		? 'Writing fetched releases and tracks to your library.'
		: 'Fetching release metadata from Discogs.'
})

function failureStageLabel(stage: 'fetch' | 'pipeline' | 'save') {
	if (stage === 'fetch') return 'Discogs fetch'
	if (stage === 'save') return 'Library write'
	return 'Transfer'
}

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

			<ScrollArea class="max-h-80" aria-live="polite">
				<div
					v-if="!discogs.isImporting && discogs.retrySummary"
					class="border-signal/25 bg-signal/5 mb-2 rounded-sm border p-3"
				>
					<div class="flex items-start gap-2">
						<RotateCcw class="text-signal mt-0.5 size-4 shrink-0" />
						<p class="text-sm">
							Recovered
							<strong class="font-mono tabular-nums">
								{{ discogs.retrySummary.recovered }}
							</strong>
							of
							<strong class="font-mono tabular-nums">
								{{ discogs.retrySummary.attempted }}
							</strong>
							failed
							{{ discogs.retrySummary.attempted === 1 ? 'record' : 'records' }}.
							<template v-if="discogs.retrySummary.remaining > 0">
								{{ discogs.retrySummary.remaining }} still
								{{ discogs.retrySummary.remaining === 1 ? 'needs' : 'need' }}
								attention.
							</template>
						</p>
					</div>
				</div>
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
								<Collapsible v-model:open="showFailures" class="space-y-2">
									<CollapsibleTrigger as-child>
										<Button
											variant="blank"
											class="text-destructive hover:text-destructive h-auto p-0 text-xs"
										>
											{{ showFailures ? 'Hide details' : 'Show details' }}
											<ChevronDown
												class="transition-all"
												:class="{ 'scale-y-[-1]': showFailures }"
											/>
										</Button>
									</CollapsibleTrigger>
									<CollapsibleContent as-child>
										<ul class="space-y-2">
											<li
												v-for="(record, index) in discogs.importResults.failed"
												:key="`failed-${record.releaseId ?? 'transfer'}-${index}`"
												class="border-destructive/15 border-t pt-2 text-gray-600 first:border-t-0 first:pt-0 dark:text-gray-400"
											>
												<div class="flex items-start justify-between gap-3">
													<div class="font-medium">
														{{ record.label }}
													</div>
													<span
														class="border-border bg-workbench-inset shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] tracking-wide uppercase"
													>
														{{ failureStageLabel(record.stage) }}
													</span>
												</div>
												<div class="text-xs text-red-600 dark:text-red-400">
													{{ record.error }}
												</div>
												<div
													class="text-muted-foreground mt-1 font-mono text-[9px] uppercase"
												>
													{{ record.attempts }}
													{{ record.attempts === 1 ? 'attempt' : 'attempts' }}
													<span v-if="!record.retryable">
														· New import required
													</span>
												</div>
											</li>
										</ul>
									</CollapsibleContent>
								</Collapsible>
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
						{{
							discogs.transferMode === 'retry'
								? 'Cancel retry'
								: 'Cancel import'
						}}
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
					<Button
						v-if="discogs.canRetryFailed"
						data-testid="retry-failed-records"
						@click="discogs.retryFailedReleases()"
					>
						<RotateCcw />
						Retry {{ discogs.retryableFailures.length }} failed
						{{ discogs.retryableFailures.length === 1 ? 'record' : 'records' }}
					</Button>
				</div>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
