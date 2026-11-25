<script setup lang="ts">
import { Copy, Download, Share } from '@lucide/vue'
import { toast } from 'vue-sonner'
import {
	SET_LIST_FORMATS,
	type SetListFormat,
	buildSetListRows,
	createSetListFilename,
	formatSetList
} from '~/utils/setListExport'
import { copyTextToClipboard, downloadTextFile } from '~/utils/textFileExport'

const session = useWorkbenchSessionStore()
const tracks = useWorkbenchTracksStore()
const preferences = useWorkbenchPreferencesStore()

const formats = Object.keys(SET_LIST_FORMATS) as SetListFormat[]

const setName = computed(() => {
	const id = session.activeSetId
	if (!id) return null
	return session.savedSets.find((savedSet) => savedSet.id === id)?.name ?? null
})

function render(format: SetListFormat): string {
	const rows = buildSetListRows(
		session.currentSession,
		(trackId) => tracks.getTrackById(trackId),
		preferences.currentKeyFormat
	)
	return formatSetList(rows, format)
}

async function copy(format: SetListFormat) {
	const copied = await copyTextToClipboard(render(format))
	if (copied) {
		toast.success(`Set list copied as ${SET_LIST_FORMATS[format].label}.`)
	} else {
		toast.error('Could not copy to the clipboard. Try downloading instead.')
	}
}

function download(format: SetListFormat) {
	const { mimeType } = SET_LIST_FORMATS[format]
	const saved = downloadTextFile(
		createSetListFilename(setName.value, format, new Date()),
		render(format),
		mimeType,
		{ withBom: format === 'csv' }
	)
	if (!saved) toast.error('This browser could not save the file.')
}
</script>

<template>
	<DropdownMenu>
		<DropdownMenuTrigger as-child>
			<Button
				variant="outline"
				size="sm"
				class="h-7 gap-1.5 px-2 text-xs"
				:disabled="session.currentSession.length === 0"
			>
				<Share class="size-3.5" />
				Export
			</Button>
		</DropdownMenuTrigger>
		<DropdownMenuContent align="end" class="w-52">
			<DropdownMenuLabel class="text-xs">Copy set list</DropdownMenuLabel>
			<DropdownMenuItem
				v-for="format in formats"
				:key="`copy-${format}`"
				@click="copy(format)"
			>
				<Copy class="mr-2 size-4" />
				{{ SET_LIST_FORMATS[format].label }}
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuLabel class="text-xs">Download</DropdownMenuLabel>
			<DropdownMenuItem
				v-for="format in formats"
				:key="`download-${format}`"
				@click="download(format)"
			>
				<Download class="mr-2 size-4" />
				{{ SET_LIST_FORMATS[format].label }} (.{{
					SET_LIST_FORMATS[format].extension
				}})
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
</template>
