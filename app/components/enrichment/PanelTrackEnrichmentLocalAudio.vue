<script setup lang="ts">
import {
	AlertTriangle,
	AudioWaveform,
	CheckCircle2,
	FolderOpen,
	ListChecks,
	Play,
	Square,
	Tags
} from 'lucide-vue-next'
import type { LocalAudioReviewSelection } from '~/types/localAudio'

const emit = defineEmits<{
	review: [selection: LocalAudioReviewSelection]
}>()

const fallbackInput = ref<HTMLInputElement | null>(null)
const {
	entries,
	readySources,
	pendingCount,
	processedCount,
	errorCount,
	cachedCount,
	analysisCandidateCount,
	completeDataCount,
	partialDataCount,
	noDataCount,
	visibleEntries,
	isPickingFolder,
	isAnalyzing,
	processingMode,
	completedInBatch,
	batchTotal,
	statusMessage,
	pickFolder,
	setFiles,
	scanMetadata,
	analyzeNextBatch,
	cancelProcessing
} = useLocalAudioAnalysis()

const progress = computed(() => {
	if (processingMode.value === 'tags-only') {
		return entries.value.length === 0
			? 0
			: Math.round((processedCount.value / entries.value.length) * 100)
	}
	return batchTotal.value === 0
		? 0
		: Math.round((completedInBatch.value / batchTotal.value) * 100)
})

const progressCount = computed(() =>
	processingMode.value === 'tags-only'
		? `${formatCount(processedCount.value)} / ${formatCount(entries.value.length)}`
		: `${formatCount(completedInBatch.value)} / ${formatCount(batchTotal.value)}`
)

const statusDetail = computed(() => {
	if (entries.value.length === 0) {
		return 'Choose a folder to begin with a fast embedded-tag scan.'
	}
	if (isAnalyzing.value && processingMode.value === 'tags-only') {
		return `${formatCount(processedCount.value)} of ${formatCount(entries.value.length)} files scanned`
	}
	if (isAnalyzing.value) {
		return `${formatCount(completedInBatch.value)} of ${formatCount(batchTotal.value)} files analyzed in this batch`
	}
	if (pendingCount.value > 0) {
		return `${formatCount(processedCount.value)} scanned · ${formatCount(pendingCount.value)} still unscanned`
	}
	return `${formatCount(processedCount.value)} scanned · ${formatCount(readySources.value.length)} contain usable BPM or key data${errorCount.value ? ` · ${formatCount(errorCount.value)} failed` : ''}`
})

function formatCount(value: number): string {
	return value.toLocaleString()
}

async function chooseFolder() {
	const result = await pickFolder()
	if (result === 'fallback') {
		fallbackInput.value?.click()
	} else if (result === 'selected') {
		await scanMetadata()
	}
}

function openFallbackPicker() {
	fallbackInput.value?.click()
}

async function handleFallbackFiles(event: Event) {
	const input = event.target as HTMLInputElement
	setFiles(Array.from(input.files ?? []))
	input.value = ''
	await scanMetadata()
}

function entryStatus(entry: (typeof entries.value)[number]) {
	if (entry.status === 'reading-tags') return 'Reading tags'
	if (entry.status === 'decoding') return 'Decoding'
	if (entry.status === 'analyzing') return 'Analyzing'
	if (entry.status === 'cached') return 'Cached'
	if (entry.status === 'complete') return 'Metadata read'
	if (entry.status === 'error') return 'Error'
	return 'Queued'
}

function reviewAvailableData() {
	emit('review', {
		sources: readySources.value,
		totalFiles: entries.value.length,
		processedFiles: processedCount.value
	})
}
</script>

<template>
	<div class="border-border overflow-hidden rounded-md border">
		<input
			ref="fallbackInput"
			type="file"
			accept="audio/*,.flac,.wav,.wv,.aif,.aiff,.ape"
			webkitdirectory
			multiple
			class="hidden"
			@change="handleFallbackFiles"
		/>

		<div class="grid lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]">
			<div class="border-border p-4 lg:border-r">
				<div class="flex items-start gap-3">
					<div
						class="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md"
					>
						<FolderOpen class="size-4" />
					</div>
					<div class="min-w-0">
						<h3 class="text-sm font-semibold">Choose an audio folder</h3>
						<p class="text-muted-foreground mt-1 text-sm">
							Crate Guide reads tags first. Audio analysis runs only when you
							request it.
						</p>
					</div>
				</div>

				<ButtonLoading
					class="mt-4 w-full"
					:loading="isPickingFolder"
					:disabled="isAnalyzing"
					@click="chooseFolder"
				>
					<FolderOpen class="mr-2 size-4" />
					{{ entries.length ? 'Choose another folder' : 'Choose folder' }}
				</ButtonLoading>
				<Button
					variant="ghost"
					size="sm"
					class="mt-1 w-full"
					:disabled="isAnalyzing || isPickingFolder"
					@click="openFallbackPicker"
				>
					Use compatible picker
				</Button>
			</div>

			<div class="p-4">
				<div
					class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
				>
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<Tags class="text-muted-foreground size-4" />
							<h3 class="text-sm font-semibold">{{ statusMessage }}</h3>
						</div>
						<p class="text-muted-foreground mt-1 text-xs">
							{{ statusDetail }}
						</p>
					</div>

					<div class="flex shrink-0 flex-wrap gap-2">
						<Button
							v-if="(pendingCount > 0 || errorCount > 0) && !isAnalyzing"
							variant="outline"
							size="sm"
							@click="scanMetadata"
						>
							<Play class="mr-1.5 size-3.5" />
							{{
								pendingCount > 0
									? 'Resume scan'
									: `Retry failed (${errorCount})`
							}}
						</Button>
						<Button
							v-if="isAnalyzing"
							variant="outline"
							size="sm"
							@click="cancelProcessing"
						>
							<Square class="mr-1.5 size-3.5" />
							{{
								processingMode === 'tags-only' ? 'Stop scan' : 'Stop analysis'
							}}
						</Button>
						<Button
							v-if="analysisCandidateCount > 0"
							variant="outline"
							size="sm"
							:disabled="isAnalyzing || pendingCount > 0"
							@click="analyzeNextBatch(10)"
						>
							<AudioWaveform class="mr-1.5 size-3.5" />
							Analyze 10 missing
						</Button>
						<Button
							size="sm"
							:disabled="readySources.length === 0 || isAnalyzing"
							@click="reviewAvailableData"
						>
							<ListChecks class="mr-1.5 size-3.5" />
							Review {{ formatCount(readySources.length) }} files
						</Button>
					</div>
				</div>

				<div
					v-if="entries.length"
					class="border-border mt-4 grid grid-cols-2 divide-x divide-y rounded-md border sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0"
				>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">Files</div>
						<div class="font-semibold tabular-nums">
							{{ formatCount(entries.length) }}
						</div>
					</div>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">Scanned</div>
						<div class="font-semibold tabular-nums">
							{{ formatCount(processedCount) }}
						</div>
						<div v-if="cachedCount" class="text-muted-foreground text-[11px]">
							{{ formatCount(cachedCount) }} cached
						</div>
					</div>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">BPM + key</div>
						<div class="font-semibold tabular-nums">
							{{ formatCount(completeDataCount) }}
						</div>
					</div>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">One value</div>
						<div class="font-semibold tabular-nums">
							{{ formatCount(partialDataCount) }}
						</div>
					</div>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">No usable data</div>
						<div class="font-semibold tabular-nums">
							{{ formatCount(noDataCount) }}
						</div>
					</div>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">Failed</div>
						<div
							class="font-semibold tabular-nums"
							:class="errorCount ? 'text-destructive' : ''"
						>
							{{ formatCount(errorCount) }}
						</div>
					</div>
				</div>

				<div v-if="isAnalyzing" class="mt-4 space-y-2">
					<div
						class="text-muted-foreground flex items-center justify-between text-xs"
					>
						<span>Processing locally</span>
						<span class="font-mono">{{ progressCount }}</span>
					</div>
					<Progress :model-value="progress" />
				</div>

				<div
					v-if="visibleEntries.length && !isAnalyzing"
					class="border-border mt-4 max-h-44 overflow-y-auto border-t pt-2"
				>
					<div
						v-for="entry in visibleEntries.slice(0, 8)"
						:key="entry.id"
						class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1 text-xs"
					>
						<span class="truncate" :title="entry.relativePath">
							{{ entry.relativePath }}
						</span>
						<span
							class="text-muted-foreground flex max-w-72 items-center gap-1.5"
							:class="entry.error ? 'text-destructive' : ''"
							:title="entry.error || entryStatus(entry)"
						>
							<AlertTriangle v-if="entry.error" class="size-3" />
							<CheckCircle2 v-else class="size-3" />
							<span class="truncate">
								{{ entry.error || entryStatus(entry) }}
							</span>
						</span>
					</div>
				</div>

				<div
					v-if="pendingCount && !isAnalyzing"
					class="mt-3 flex items-center justify-between gap-3 text-xs"
				>
					<span class="text-amber-700 dark:text-amber-400">
						{{ formatCount(pendingCount) }} files have not been scanned yet.
					</span>
					<span v-if="analysisCandidateCount" class="text-muted-foreground">
						{{ formatCount(analysisCandidateCount) }} scanned files can be
						analyzed
					</span>
				</div>
			</div>
		</div>

		<div
			class="border-border bg-muted/30 flex flex-wrap gap-x-5 gap-y-1 border-t px-4 py-2.5 text-xs"
		>
			<span>Runs entirely in this browser</span>
			<span>No audio is uploaded</span>
			<span>Results are cached on this device</span>
		</div>
	</div>
</template>
