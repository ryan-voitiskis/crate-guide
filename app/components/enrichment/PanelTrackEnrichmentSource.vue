<script setup lang="ts">
import {
	AudioWaveform,
	Check,
	ExternalLink,
	FileMusic,
	Upload
} from 'lucide-vue-next'
import type { LocalAudioReviewSelection } from '~/types/localAudio'

const props = defineProps<{
	activeSource: 'rekordboxXml' | 'localAudio'
	isParsing: boolean
	parseCompleted: number
	parseTotal: number
	parseProgress: number
	selectedFileName?: string | null
	disabled?: boolean
}>()

const emit = defineEmits<{
	selectSource: [source: 'rekordboxXml' | 'localAudio']
	selectFile: []
	dropFile: [file: File]
	reviewLocal: [selection: LocalAudioReviewSelection]
}>()

function handleDrop(event: DragEvent) {
	if (props.isParsing || props.disabled) return
	const file = event.dataTransfer?.files?.[0]
	if (file) emit('dropFile', file)
}
</script>

<template>
	<section class="space-y-3" aria-labelledby="enrichment-source-heading">
		<h2 id="enrichment-source-heading" class="sr-only">
			Choose enrichment source
		</h2>

		<div
			class="border-border bg-muted/20 grid grid-cols-2 gap-1 rounded-sm border p-1"
			role="radiogroup"
			aria-label="Enrichment source"
		>
			<button
				type="button"
				role="radio"
				:aria-checked="activeSource === 'rekordboxXml'"
				:disabled="disabled"
				class="flex h-11 min-w-0 items-center gap-2 rounded-sm border px-2 text-left transition-colors sm:px-3"
				:class="
					activeSource === 'rekordboxXml'
						? 'border-primary bg-primary/10 text-foreground'
						: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground border-transparent'
				"
				@click="emit('selectSource', 'rekordboxXml')"
			>
				<FileMusic class="size-4 shrink-0" />
				<span class="min-w-0 flex-1 truncate text-xs font-semibold sm:text-sm">
					Rekordbox XML
				</span>
				<Check
					v-if="activeSource === 'rekordboxXml'"
					class="text-primary hidden size-4 shrink-0 sm:block"
				/>
			</button>

			<button
				type="button"
				role="radio"
				:aria-checked="activeSource === 'localAudio'"
				:disabled="disabled"
				class="flex h-11 min-w-0 items-center gap-2 rounded-sm border px-2 text-left transition-colors sm:px-3"
				:class="
					activeSource === 'localAudio'
						? 'border-primary bg-primary/10 text-foreground'
						: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground border-transparent'
				"
				@click="emit('selectSource', 'localAudio')"
			>
				<AudioWaveform class="size-4 shrink-0" />
				<span class="min-w-0 truncate text-xs font-semibold sm:text-sm">
					Local audio
				</span>
				<span
					class="bg-muted rounded-sm px-1.5 py-0.5 font-mono text-[9px] tracking-wide uppercase"
				>
					Beta
				</span>
				<Check
					v-if="activeSource === 'localAudio'"
					class="text-primary hidden size-4 shrink-0 sm:block"
				/>
			</button>
		</div>

		<div
			v-if="activeSource === 'rekordboxXml'"
			class="border-border bg-card/40 overflow-hidden rounded-sm border border-dashed"
			:aria-busy="isParsing"
			@dragover.prevent
			@drop.prevent="handleDrop"
		>
			<div
				class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5"
			>
				<div
					class="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-sm"
				>
					<FileMusic class="size-5" />
				</div>

				<div class="min-w-0 flex-1">
					<h3
						class="truncate text-sm font-semibold sm:text-base"
						:title="selectedFileName || undefined"
					>
						{{ selectedFileName || 'Drop Rekordbox XML' }}
					</h3>
					<div
						class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
					>
						<a
							href="https://rekordbox.com/en/support/faq/operation-hints-7/#faq-84681"
							target="_blank"
							rel="noopener noreferrer"
							class="text-primary inline-flex items-center gap-1 font-medium hover:underline"
						>
							Export help
							<ExternalLink class="size-3" />
						</a>
						<span aria-hidden="true">·</span>
						<span>Local only</span>
						<span aria-hidden="true">·</span>
						<span>Blank BPM + key only</span>
					</div>
				</div>

				<div
					class="flex w-full shrink-0 flex-col items-stretch gap-1 sm:w-auto sm:items-center"
				>
					<ButtonLoading
						:loading="isParsing"
						:disabled="disabled"
						@click="emit('selectFile')"
					>
						<Upload class="mr-2 size-4" />
						{{ selectedFileName ? 'Replace XML' : 'Choose XML' }}
					</ButtonLoading>
					<span class="text-muted-foreground hidden text-[11px] sm:inline">
						or drop it here
					</span>
				</div>
			</div>

			<div
				v-if="isParsing && parseTotal > 0"
				class="border-border bg-muted/20 space-y-2 border-t px-4 py-3"
			>
				<div
					class="text-muted-foreground flex items-center justify-between font-mono text-[10px] tracking-wide uppercase"
				>
					<span>Matching</span>
					<span>{{ parseCompleted }} / {{ parseTotal }}</span>
				</div>
				<Progress :model-value="parseProgress" />
			</div>
		</div>

		<PanelTrackEnrichmentLocalAudio
			v-else
			:disabled="disabled"
			@review="emit('reviewLocal', $event)"
		/>
	</section>
</template>
