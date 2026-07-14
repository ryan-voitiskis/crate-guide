<script setup lang="ts">
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Check,
	CheckCircle2,
	FileUp,
	ListChecks,
	RefreshCw,
	ShieldCheck,
	Upload,
	X
} from 'lucide-vue-next'

const records = useRecordsStore()
const tracks = useTracksStore()
const user = useUserStore()

const fileInput = ref<HTMLInputElement | null>(null)
const collectionLoadState = ref<'loading' | 'ready' | 'failed'>('loading')
const {
	activeSource,
	selectedFileName,
	rows,
	stagedRowIds,
	selectedFilter,
	currentPage,
	parseWarnings,
	parseErrors,
	isParsing,
	parseCompleted,
	parseTotal,
	isApplying,
	showApplyDialog,
	applyCompleted,
	applyTotal,
	lastApplySummary,
	currentStep,
	matchedRows,
	readyRows,
	reviewRows,
	unmatchedRows,
	stagedRows,
	blockedCount,
	errorCount,
	matchRate,
	applyProgress,
	parseProgress,
	visibleParseWarnings,
	sourceLabel,
	filterOptions,
	filteredRows,
	stageableFilteredRows,
	filteredSelectionState,
	pageCount,
	pagedRows,
	shownStart,
	shownEnd,
	stagedBpmCount,
	stagedKeyModeCount,
	isStepComplete,
	canNavigateToStep,
	navigateToStep,
	parseFile,
	reviewLocalSources,
	selectSource,
	returnToSource,
	startAnotherSource,
	setRowStaged,
	setFilteredRowsStaged,
	clearStagedRows,
	openApplyReview,
	applyStagedRows,
	returnToReview
} = useTrackEnrichmentWorkflow()

const workflowSteps = [
	{ number: 1, label: 'Choose source', shortLabel: 'Source' },
	{ number: 2, label: 'Review matches', shortLabel: 'Review' },
	{ number: 3, label: 'Apply updates', shortLabel: 'Apply' }
] as const

onMounted(async () => {
	const results = await Promise.all([
		records.fetchAllRecords(),
		tracks.fetchAllTracks()
	])
	collectionLoadState.value = results.every((result) => result)
		? 'ready'
		: 'failed'
})

function openFilePicker() {
	fileInput.value?.click()
}

async function handleFileInput(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return

	await parseFile(file)
	input.value = ''
}

function handleFileDrop(file: File) {
	void parseFile(file)
}
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col">
		<div class="scrollbar-hidden flex-1 overflow-y-auto">
			<div
				class="mx-auto flex max-w-[1600px] flex-col gap-3 p-3 pb-0 sm:p-4 sm:pb-0"
			>
				<input
					ref="fileInput"
					type="file"
					accept=".xml,text/xml,application/xml"
					class="hidden"
					@change="handleFileInput"
				/>

				<div
					class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
				>
					<div class="min-w-0">
						<div
							class="text-muted-foreground mb-1 font-mono text-[10px] tracking-[0.18em] uppercase"
						>
							Analysis / Metadata repair
						</div>
						<h1 class="text-xl font-semibold tracking-tight">BPM &amp; Key</h1>
						<p class="text-muted-foreground truncate text-sm">
							{{
								selectedFileName ||
								'Complete your collection with existing DJ analysis'
							}}
						</p>
					</div>

					<div class="flex items-center gap-2">
						<div
							class="border-border bg-muted/30 hidden items-center gap-2 rounded-sm border px-2.5 py-1.5 font-mono text-[10px] tracking-wide uppercase sm:flex"
						>
							<span
								class="size-1.5 rounded-full"
								:class="
									collectionLoadState === 'ready'
										? 'bg-emerald-500'
										: 'bg-amber-500'
								"
							/>
							{{
								collectionLoadState === 'ready' ? 'Library ready' : 'Indexing'
							}}
						</div>
						<Button
							v-if="currentStep === 2"
							variant="outline"
							size="sm"
							@click="returnToSource"
						>
							<ArrowLeft class="mr-2 size-4" />
							Back to source
						</Button>
					</div>
				</div>

				<div
					class="border-border bg-card/60 grid grid-cols-3 overflow-hidden rounded-sm border shadow-xs"
				>
					<button
						v-for="step in workflowSteps"
						:key="step.number"
						type="button"
						:disabled="
							collectionLoadState !== 'ready' || !canNavigateToStep(step.number)
						"
						class="border-border flex min-w-0 items-center gap-2 border-r px-2 py-2 last:border-r-0 sm:px-4"
						:class="
							currentStep === step.number
								? 'bg-muted/60'
								: collectionLoadState === 'ready' &&
									  canNavigateToStep(step.number)
									? 'bg-background hover:bg-muted/30'
									: 'bg-background cursor-default'
						"
						@click="navigateToStep(step.number)"
					>
						<div
							class="flex size-5 shrink-0 items-center justify-center rounded-[2px] border font-mono text-[10px] font-semibold"
							:class="
								isStepComplete(step.number)
									? 'border-primary bg-primary text-primary-foreground'
									: currentStep === step.number
										? 'border-foreground text-foreground'
										: 'border-border text-muted-foreground'
							"
						>
							<Check v-if="isStepComplete(step.number)" class="size-3.5" />
							<span v-else>{{ step.number }}</span>
						</div>
						<span
							class="min-w-0 text-xs font-medium sm:text-sm"
							:class="
								currentStep === step.number
									? 'text-foreground'
									: 'text-muted-foreground'
							"
						>
							<span class="sm:hidden">{{ step.shortLabel }}</span>
							<span class="hidden sm:inline">{{ step.label }}</span>
						</span>
					</button>
				</div>

				<StateLoading
					v-if="collectionLoadState === 'loading'"
					message="Loading collection..."
				/>

				<NoticeError v-else-if="collectionLoadState === 'failed'">
					Collection data could not be loaded. Refresh to try again.
				</NoticeError>

				<template v-else>
					<NoticeError v-if="parseErrors.length" class="items-start">
						<div class="space-y-1">
							<div v-for="error in parseErrors" :key="error">{{ error }}</div>
						</div>
					</NoticeError>

					<NoticeWarning v-if="parseWarnings.length" class="items-start">
						<div class="space-y-1">
							<div v-for="warning in visibleParseWarnings" :key="warning">
								{{ warning }}
							</div>
							<div v-if="parseWarnings.length > visibleParseWarnings.length">
								+ {{ parseWarnings.length - visibleParseWarnings.length }} more
								warnings
							</div>
						</div>
					</NoticeWarning>

					<PanelTrackEnrichmentSource
						v-show="currentStep === 1"
						:active-source="activeSource"
						:is-parsing="isParsing"
						:parse-completed="parseCompleted"
						:parse-total="parseTotal"
						:parse-progress="parseProgress"
						@select-file="openFilePicker"
						@drop-file="handleFileDrop"
						@select-source="selectSource"
						@review-local="reviewLocalSources"
					/>

					<div v-if="lastApplySummary" class="py-8 sm:py-12">
						<div
							class="mx-auto flex max-w-2xl flex-col items-center text-center"
						>
							<CheckCircle2 class="text-primary size-10" />
							<h2 class="mt-4 text-lg font-semibold">Enrichment complete</h2>
							<p class="text-muted-foreground mt-1 text-sm">
								{{ lastApplySummary.succeeded }} of {{ lastApplySummary.total }}
								staged tracks updated.
							</p>

							<div
								class="border-border mt-6 grid w-full grid-cols-3 divide-x rounded-md border"
							>
								<div class="px-3 py-3">
									<div class="text-muted-foreground text-xs">Tracks</div>
									<div class="mt-1 text-xl font-semibold tabular-nums">
										{{ lastApplySummary.succeeded }}
									</div>
								</div>
								<div class="px-3 py-3">
									<div class="text-muted-foreground text-xs">BPM filled</div>
									<div class="mt-1 text-xl font-semibold tabular-nums">
										{{ lastApplySummary.bpm }}
									</div>
								</div>
								<div class="px-3 py-3">
									<div class="text-muted-foreground text-xs">Keys filled</div>
									<div class="mt-1 text-xl font-semibold tabular-nums">
										{{ lastApplySummary.keyMode }}
									</div>
								</div>
							</div>

							<NoticeError v-if="lastApplySummary.failed" class="mt-4 w-full">
								{{ lastApplySummary.failed }} updates failed. Review the result
								rows for details.
							</NoticeError>

							<div class="mt-6 flex flex-wrap justify-center gap-2">
								<Button variant="outline" @click="returnToReview">
									<ArrowLeft class="mr-2 size-4" />
									Review results
								</Button>
								<Button @click="startAnotherSource">
									<FileUp class="mr-2 size-4" />
									Use another source
								</Button>
							</div>
						</div>
					</div>

					<template v-else-if="currentStep === 2">
						<div
							class="border-border grid grid-cols-2 divide-x divide-y overflow-hidden rounded-md border sm:grid-cols-6 sm:divide-y-0"
						>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">
									{{ sourceLabel }} tracks
								</div>
								<div class="mt-0.5 text-lg font-semibold tabular-nums">
									{{ rows.length }}
								</div>
							</div>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">Matched</div>
								<div class="mt-0.5 flex items-baseline gap-1.5">
									<span class="text-lg font-semibold tabular-nums">
										{{ matchedRows.length }}
									</span>
									<span class="text-muted-foreground text-xs">
										{{ matchRate }}
									</span>
								</div>
							</div>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">Ready</div>
								<div
									class="text-primary mt-0.5 text-lg font-semibold tabular-nums"
								>
									{{ readyRows.length }}
								</div>
							</div>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">Needs review</div>
								<div class="mt-0.5 text-lg font-semibold tabular-nums">
									{{ reviewRows.length }}
								</div>
							</div>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">Staged</div>
								<div
									class="mt-0.5 text-lg font-semibold text-emerald-700 tabular-nums dark:text-emerald-400"
								>
									{{ stagedRows.length }}
								</div>
							</div>
							<div class="px-3 py-2.5">
								<div class="text-muted-foreground text-xs">
									Not in collection
								</div>
								<div class="mt-0.5 text-lg font-semibold tabular-nums">
									{{ unmatchedRows.length }}
								</div>
							</div>
						</div>

						<div
							v-if="blockedCount || errorCount"
							class="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
						>
							<span v-if="blockedCount" class="flex items-center gap-1.5">
								<AlertTriangle class="size-3.5 text-amber-600" />
								{{ blockedCount }} competing matches blocked
							</span>
							<span v-if="errorCount" class="text-destructive">
								{{ errorCount }} errors
							</span>
						</div>

						<div
							class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"
						>
							<ToggleGroup
								v-model="selectedFilter"
								type="single"
								variant="outline"
								class="max-w-full flex-wrap justify-start"
							>
								<ToggleGroupItem
									v-for="option in filterOptions"
									:key="option.value"
									:value="option.value"
									size="sm"
									class="gap-1.5"
								>
									{{ option.label }}
									<span class="text-muted-foreground tabular-nums">
										{{ option.count }}
									</span>
								</ToggleGroupItem>
							</ToggleGroup>

							<div class="flex items-center gap-1 self-end lg:self-auto">
								<Button
									variant="ghost"
									size="sm"
									:disabled="
										stageableFilteredRows.length === 0 ||
										filteredSelectionState === true
									"
									@click="setFilteredRowsStaged(true)"
								>
									<ListChecks class="mr-1.5 size-4" />
									Stage all eligible ({{ stageableFilteredRows.length }})
								</Button>
								<Button
									variant="ghost"
									size="sm"
									:disabled="stagedRows.length === 0"
									@click="clearStagedRows"
								>
									<X class="mr-1.5 size-4" />
									Clear staged
								</Button>
							</div>
						</div>

						<div
							v-if="filteredRows.length === 0"
							class="border-border flex min-h-40 items-center justify-center rounded-md border border-dashed"
						>
							<div
								class="text-muted-foreground flex items-center gap-2 text-sm"
							>
								<RefreshCw class="size-4" />
								No rows in this view
							</div>
						</div>

						<template v-else>
							<TableTrackEnrichmentReview
								:rows="pagedRows"
								:staged-row-ids="stagedRowIds"
								:filtered-selection-state="filteredSelectionState"
								:stageable-row-count="stageableFilteredRows.length"
								:is-applying="isApplying"
								:key-format="user.currentKeyFormat"
								:source-label="sourceLabel"
								@stage-all="setFilteredRowsStaged"
								@stage-row="setRowStaged"
							/>

							<div class="flex items-center justify-between gap-3 pb-2 text-sm">
								<div class="text-muted-foreground tabular-nums">
									{{ shownStart }}-{{ shownEnd }} of {{ filteredRows.length }}
								</div>
								<div class="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										:disabled="currentPage === 1"
										@click="currentPage--"
									>
										<ArrowLeft class="size-4" />
										<span class="sr-only">Previous page</span>
									</Button>
									<span class="text-muted-foreground tabular-nums">
										{{ currentPage }} / {{ pageCount }}
									</span>
									<Button
										variant="outline"
										size="sm"
										:disabled="currentPage === pageCount"
										@click="currentPage++"
									>
										<ArrowRight class="size-4" />
										<span class="sr-only">Next page</span>
									</Button>
								</div>
							</div>
						</template>

						<div
							class="border-border bg-background/95 sticky bottom-0 z-10 -mx-2 mt-1 flex flex-col gap-2 border-t-2 border-t-emerald-500 px-3 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="flex min-w-0 items-center gap-3">
								<div
									class="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
								>
									<ListChecks class="size-4" />
								</div>
								<div class="min-w-0">
									<div class="text-sm font-semibold">
										{{ stagedRows.length }} tracks staged for import
									</div>
									<div class="text-muted-foreground text-xs">
										{{ stagedBpmCount }} BPM and {{ stagedKeyModeCount }} key
										values will be filled
									</div>
								</div>
							</div>
							<Button
								:disabled="stagedRows.length === 0 || isApplying"
								@click="openApplyReview"
							>
								<ShieldCheck class="mr-2 size-4" />
								Review staged updates ({{ stagedRows.length }})
							</Button>
						</div>
					</template>
				</template>
			</div>
		</div>

		<Dialog
			v-if="collectionLoadState === 'ready'"
			v-model:open="showApplyDialog"
		>
			<DialogContent class="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						Apply {{ stagedRows.length }} staged track updates?
					</DialogTitle>
					<DialogDescription>
						Only blank fields will be filled. Existing BPM and key values remain
						unchanged.
					</DialogDescription>
				</DialogHeader>

				<div class="border-border grid grid-cols-3 divide-x rounded-md border">
					<div class="px-3 py-3 text-center">
						<div class="text-muted-foreground text-xs">Tracks</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							{{ stagedRows.length }}
						</div>
					</div>
					<div class="px-3 py-3 text-center">
						<div class="text-muted-foreground text-xs">BPM</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							{{ stagedBpmCount }}
						</div>
					</div>
					<div class="px-3 py-3 text-center">
						<div class="text-muted-foreground text-xs">Keys</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							{{ stagedKeyModeCount }}
						</div>
					</div>
				</div>

				<div class="text-muted-foreground flex items-start gap-2 text-sm">
					<ShieldCheck class="text-primary mt-0.5 size-4 shrink-0" />
					<span>Match details and source provenance will be retained.</span>
				</div>

				<div v-if="isApplying" class="flex flex-col gap-2">
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Applying updates</span>
						<span class="font-mono">
							{{ applyCompleted }} / {{ applyTotal }}
						</span>
					</div>
					<Progress :model-value="applyProgress" />
				</div>

				<DialogFooter class="gap-2">
					<Button
						variant="outline"
						:disabled="isApplying"
						@click="showApplyDialog = false"
					>
						Back to review
					</Button>
					<ButtonLoading :loading="isApplying" @click="applyStagedRows">
						<Upload class="mr-2 size-4" />
						Apply updates
					</ButtonLoading>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>
