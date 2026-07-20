<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
	CloudDownload,
	FolderOpen,
	KeyRound,
	Library,
	LoaderCircle,
	Maximize2,
	Music2,
	Plus,
	Radio
} from 'lucide-vue-next'

const props = withDefaults(
	defineProps<{
		title: string
		description: string
		icon?: 'records' | 'session' | 'tracks' | 'crates'
		class?: HTMLAttributes['class']
	}>(),
	{
		icon: 'records'
	}
)

const discogs = useDiscogsStore()
const discogsAuth = useDiscogsAuthStore()
const manualEntry = useManualRecordEntryStore()

const iconComponents = {
	records: Library,
	session: Radio,
	tracks: Music2,
	crates: FolderOpen
}

const emptyIcon = computed(() => iconComponents[props.icon])
const primaryIcon = computed(() =>
	discogsAuth.isOAuthed ? CloudDownload : KeyRound
)
const primaryLabel = computed(() =>
	discogsAuth.isOAuthed ? 'Import from Discogs' : 'Connect to Discogs'
)
const activeTransferTitle = computed(() =>
	discogs.transferMode === 'retry'
		? 'Discogs retry in progress'
		: 'Discogs import in progress'
)
const activeTransferPhase = computed(() => {
	if (discogs.importPhase === 'saving') return 'Writing records to your library'
	if (discogs.transferMode === 'retry') return 'Retrying failed records'
	return 'Fetching release metadata'
})
const activeTransferItem = computed(
	() =>
		discogs.retryStatus?.label ??
		discogs.releaseBeingImported?.basic_information.title ??
		null
)
const activeTransferLabel = computed(
	() => `${discogs.transferLabel}. Open the full transfer monitor.`
)

function handlePrimaryAction() {
	if (discogsAuth.isOAuthed) {
		discogs.openCollectionImport()
		return
	}

	discogsAuth.initDiscogsOAuthFlow()
}
</script>

<template>
	<div
		:class="
			cn(
				'mx-auto flex min-h-[clamp(34rem,65dvh,48rem)] max-w-sm flex-col items-center justify-center py-16 text-center',
				props.class
			)
		"
	>
		<template v-if="discogs.hasActiveTransfer">
			<div
				class="border-signal/20 bg-signal/10 text-signal mb-4 flex size-20 items-center justify-center rounded-full border"
			>
				<LoaderCircle class="size-9 animate-spin stroke-[1.5]" />
			</div>

			<h3 class="mb-2 text-lg font-semibold">{{ activeTransferTitle }}</h3>
			<p class="text-muted-foreground mb-6 max-w-sm text-sm">
				The transfer is continuing in the background. Open it for full progress
				and controls.
			</p>

			<button
				type="button"
				data-testid="active-discogs-transfer"
				class="border-border bg-workbench-inset hover:bg-muted/50 focus-visible:ring-signal w-full rounded-sm border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
				:aria-label="activeTransferLabel"
				@click="discogs.openTransferMonitor"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<div
							class="text-muted-foreground font-mono text-[9px] tracking-[0.16em] uppercase"
						>
							Discogs / Transfer active
						</div>
						<div class="mt-1 truncate text-sm font-medium">
							{{ activeTransferPhase }}
						</div>
					</div>
					<span
						v-if="discogs.importPhase === 'fetching'"
						class="text-signal shrink-0 font-mono text-xs tabular-nums"
					>
						{{ Math.round(discogs.importProgress) }}%
					</span>
				</div>

				<Progress
					v-if="discogs.importPhase === 'fetching'"
					class="mt-3 h-1.5"
					:model-value="discogs.importProgress"
				/>

				<div
					class="text-muted-foreground mt-3 flex items-center justify-between gap-3 text-xs"
				>
					<span class="min-w-0 truncate">
						{{ activeTransferItem ?? 'Processing your Discogs collection' }}
					</span>
					<span
						class="text-foreground flex shrink-0 items-center gap-1 font-medium"
					>
						Open monitor
						<Maximize2 class="size-3.5" />
					</span>
				</div>
			</button>
		</template>

		<template v-else>
			<div class="bg-muted mb-4 rounded-full p-6">
				<component :is="emptyIcon" class="text-muted-foreground size-12" />
			</div>

			<h3 class="mb-2 text-lg font-semibold">{{ title }}</h3>
			<p class="text-muted-foreground mb-6 max-w-sm">
				{{ description }}
			</p>

			<div class="w-full space-y-2">
				<ButtonLoading
					class="w-full"
					:loading="discogsAuth.isDiscogsConnecting"
					@click="handlePrimaryAction"
				>
					<component :is="primaryIcon" class="mr-2 size-4" />
					{{ primaryLabel }}
				</ButtonLoading>

				<div class="text-muted-foreground text-sm">or</div>

				<Button
					variant="secondary"
					class="w-full"
					@click="manualEntry.openDialog"
				>
					<Plus class="mr-2 size-4" />
					Add manually
				</Button>
			</div>
		</template>
	</div>
</template>
