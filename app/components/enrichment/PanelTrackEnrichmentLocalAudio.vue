<script setup lang="ts">
import {
	AlertTriangle,
	AudioWaveform,
	CheckCircle2,
	FolderOpen,
	ListChecks,
	Square,
	Tags
} from 'lucide-vue-next'
import type { LocalAudioTrackSource } from '~/types/localAudio'

const emit = defineEmits<{
	review: [sources: LocalAudioTrackSource[]]
}>()

const fallbackInput = ref<HTMLInputElement | null>(null)
const {
	entries,
	readySources,
	pendingCount,
	errorCount,
	cachedCount,
	analysisCandidateCount,
	visibleEntries,
	isPickingFolder,
	isAnalyzing,
	completedInBatch,
	batchTotal,
	statusMessage,
	pickFolder,
	setFiles,
	scanMetadata,
	analyzeNextBatch,
	cancelAnalysis
} = useLocalAudioAnalysis()

const progress = computed(() =>
	batchTotal.value === 0
		? 0
		: Math.round((completedInBatch.value / batchTotal.value) * 100)
)

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
	if (entry.status === 'complete') return 'Ready'
	if (entry.status === 'error') return 'Error'
	return 'Queued'
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

				<Button
					class="mt-4 w-full"
					:loading="isPickingFolder"
					:disabled="isAnalyzing"
					@click="chooseFolder"
				>
					<FolderOpen class="mr-2 size-4" />
					{{ entries.length ? 'Choose another folder' : 'Choose folder' }}
				</Button>
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
							Essentia estimates are filtered and require confirmation.
						</p>
					</div>

					<div class="flex shrink-0 flex-wrap gap-2">
						<Button
							v-if="isAnalyzing"
							variant="outline"
							size="sm"
							@click="cancelAnalysis"
						>
							<Square class="mr-1.5 size-3.5" />
							Stop
						</Button>
						<Button
							v-if="analysisCandidateCount > 0"
							variant="outline"
							size="sm"
							:disabled="isAnalyzing"
							@click="analyzeNextBatch(10)"
						>
							<AudioWaveform class="mr-1.5 size-3.5" />
							Analyze next 10
						</Button>
						<Button
							size="sm"
							:disabled="readySources.length === 0 || isAnalyzing"
							@click="emit('review', readySources)"
						>
							<ListChecks class="mr-1.5 size-3.5" />
							Review available data
						</Button>
					</div>
				</div>

				<div
					v-if="entries.length"
					class="border-border mt-4 grid grid-cols-2 divide-x divide-y rounded-md border sm:grid-cols-5 sm:divide-y-0"
				>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">Files</div>
						<div class="font-semibold tabular-nums">{{ entries.length }}</div>
					</div>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">Ready</div>
						<div class="font-semibold tabular-nums">
							{{ readySources.length }}
						</div>
					</div>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">Need analysis</div>
						<div class="font-semibold tabular-nums">
							{{ analysisCandidateCount }}
						</div>
					</div>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">Cached</div>
						<div class="font-semibold tabular-nums">{{ cachedCount }}</div>
					</div>
					<div class="px-3 py-2">
						<div class="text-muted-foreground text-xs">Errors</div>
						<div
							class="font-semibold tabular-nums"
							:class="errorCount ? 'text-destructive' : ''"
						>
							{{ errorCount }}
						</div>
					</div>
				</div>

				<div v-if="isAnalyzing" class="mt-4 space-y-2">
					<div
						class="text-muted-foreground flex items-center justify-between text-xs"
					>
						<span>Processing locally</span>
						<span class="font-mono">
							{{ completedInBatch }} / {{ batchTotal }}
						</span>
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
							class="text-muted-foreground flex items-center gap-1.5"
							:class="entry.error ? 'text-destructive' : ''"
						>
							<AlertTriangle v-if="entry.error" class="size-3" />
							<CheckCircle2 v-else class="size-3" />
							{{ entryStatus(entry) }}
						</span>
					</div>
				</div>

				<p v-if="pendingCount" class="text-muted-foreground mt-3 text-xs">
					{{ pendingCount }} files are waiting for their metadata scan.
				</p>
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
