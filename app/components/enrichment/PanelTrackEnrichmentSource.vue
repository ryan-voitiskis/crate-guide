<script setup lang="ts">
import {
	AudioWaveform,
	Check,
	ExternalLink,
	FileMusic,
	FolderSearch,
	ShieldCheck,
	Upload
} from 'lucide-vue-next'
import type { LocalAudioTrackSource } from '~/types/localAudio'

const props = defineProps<{
	activeSource: 'rekordboxXml' | 'localAudio'
	isParsing: boolean
	parseCompleted: number
	parseTotal: number
	parseProgress: number
}>()

const emit = defineEmits<{
	selectSource: [source: 'rekordboxXml' | 'localAudio']
	selectFile: []
	dropFile: [file: File]
	reviewLocal: [sources: LocalAudioTrackSource[]]
}>()

function handleDrop(event: DragEvent) {
	if (props.isParsing) return
	const file = event.dataTransfer?.files?.[0]
	if (file) emit('dropFile', file)
}
</script>

<template>
	<section class="space-y-4" aria-labelledby="enrichment-source-heading">
		<div>
			<h2 id="enrichment-source-heading" class="text-base font-semibold">
				Choose where the track data comes from
			</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Start with Rekordbox when your DJ library has already been analyzed.
			</p>
		</div>

		<div
			class="grid gap-3 md:grid-cols-2"
			role="radiogroup"
			aria-label="Data source"
		>
			<button
				type="button"
				role="radio"
				:aria-checked="activeSource === 'rekordboxXml'"
				class="rounded-md border p-4 text-left transition-colors"
				:class="
					activeSource === 'rekordboxXml'
						? 'border-primary bg-primary/5'
						: 'border-border hover:bg-muted/40'
				"
				@click="emit('selectSource', 'rekordboxXml')"
			>
				<div class="flex items-start gap-3">
					<div
						class="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-md"
					>
						<FileMusic class="size-4" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="text-sm font-semibold">Rekordbox XML</h3>
							<Badge>Recommended</Badge>
						</div>
						<p class="text-muted-foreground mt-1 text-sm">
							Reuse BPM and musical key already analyzed for the tracks you DJ
							with.
						</p>
					</div>
					<Check
						v-if="activeSource === 'rekordboxXml'"
						class="text-primary mt-1 size-4 shrink-0"
					/>
				</div>
			</button>

			<button
				type="button"
				role="radio"
				:aria-checked="activeSource === 'localAudio'"
				class="rounded-md border p-4 text-left transition-colors"
				:class="
					activeSource === 'localAudio'
						? 'border-primary bg-primary/5'
						: 'border-border hover:bg-muted/40'
				"
				@click="emit('selectSource', 'localAudio')"
			>
				<div class="flex items-start gap-3">
					<div
						class="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md"
					>
						<AudioWaveform class="size-4" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="text-sm font-semibold">Analyze local audio</h3>
							<Badge variant="secondary">Experimental</Badge>
						</div>
						<p class="text-muted-foreground mt-1 text-sm">
							Read embedded BPM and key tags, then estimate missing values
							privately on this device.
						</p>
					</div>
					<Check
						v-if="activeSource === 'localAudio'"
						class="text-primary mt-1 size-4 shrink-0"
					/>
				</div>
			</button>
		</div>

		<div
			v-if="activeSource === 'rekordboxXml'"
			class="border-border overflow-hidden rounded-md border"
		>
			<div class="grid md:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
				<div class="border-border p-4 md:border-r">
					<div class="flex items-start gap-3">
						<div
							class="border-border flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
						>
							1
						</div>
						<div>
							<h3 class="text-sm font-semibold">Export your collection</h3>
							<p class="text-muted-foreground mt-1 text-sm">
								In Rekordbox, choose
								<span class="text-foreground font-medium">
									File → Export Collection in xml format
								</span>
								and save the file.
							</p>
							<a
								href="https://rekordbox.com/en/support/faq/operation-hints-7/#faq-84681"
								target="_blank"
								rel="noopener noreferrer"
								class="text-primary mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline"
							>
								Official export instructions
								<ExternalLink class="size-3" />
							</a>
						</div>
					</div>
				</div>

				<div
					class="p-4"
					:aria-busy="isParsing"
					@dragover.prevent
					@drop.prevent="handleDrop"
				>
					<div class="flex items-start gap-3">
						<div
							class="border-border flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
						>
							2
						</div>
						<div class="min-w-0 flex-1">
							<h3 class="text-sm font-semibold">Import it into Crate Guide</h3>
							<p class="text-muted-foreground mt-1 text-sm">
								We match it to your Discogs collection and show proposed updates
								before saving.
							</p>
							<div class="mt-3 flex flex-wrap items-center gap-2">
								<Button :loading="isParsing" @click="emit('selectFile')">
									<Upload class="mr-2 size-4" />
									Select XML
								</Button>
								<span class="text-muted-foreground hidden text-xs sm:inline">
									or drop the file here
								</span>
							</div>

							<div
								v-if="isParsing && parseTotal > 0"
								class="mt-4 flex flex-col gap-2"
							>
								<div
									class="text-muted-foreground flex items-center justify-between text-xs"
								>
									<span>Matching collection</span>
									<span class="font-mono">
										{{ parseCompleted }} / {{ parseTotal }}
									</span>
								</div>
								<Progress :model-value="parseProgress" />
							</div>
						</div>
					</div>
				</div>
			</div>

			<div
				class="border-border bg-muted/30 grid gap-3 border-t px-4 py-3 sm:grid-cols-3"
			>
				<div class="flex items-center gap-2 text-xs">
					<FolderSearch class="text-muted-foreground size-4 shrink-0" />
					<span>Processed in your browser</span>
				</div>
				<div class="flex items-center gap-2 text-xs">
					<AudioWaveform class="text-muted-foreground size-4 shrink-0" />
					<span>No audio files are uploaded</span>
				</div>
				<div class="flex items-center gap-2 text-xs">
					<ShieldCheck class="text-muted-foreground size-4 shrink-0" />
					<span>Existing BPM and key stay unchanged</span>
				</div>
			</div>
		</div>

		<PanelTrackEnrichmentLocalAudio
			v-else
			@review="emit('reviewLocal', $event)"
		/>

		<p
			v-if="activeSource === 'rekordboxXml'"
			class="text-muted-foreground text-xs"
		>
			Rekordbox is a trademark of AlphaTheta Corporation. Crate Guide is
			independent and is not affiliated with or endorsed by AlphaTheta.
		</p>
	</section>
</template>
