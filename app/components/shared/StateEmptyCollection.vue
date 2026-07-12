<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
	CloudDownload,
	FolderOpen,
	KeyRound,
	Library,
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

function handlePrimaryAction() {
	if (discogsAuth.isOAuthed) {
		discogs.showGetFoldersDialog = true
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
	</div>
</template>
