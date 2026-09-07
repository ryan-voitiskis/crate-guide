<script setup lang="ts">
import { getFormattedKeyString } from '~/utils/keyFunctions'
import { msToMMSS } from '~/utils/formatting'
import type { TrackEditorPayload } from '~/utils/trackEditor'
import type { LibraryKeyFormat } from '~~/shared/types/library'

const props = defineProps<{
	baseline: TrackEditorPayload
	latest: TrackEditorPayload | null
	keyFormat: LibraryKeyFormat
}>()
defineEmits<{ review: [] }>()

const changedValues = computed(() => {
	if (!props.latest) return []
	const describe = (value: TrackEditorPayload) => ({
		Title: value.title,
		Artists: value.artists.map((artist) => artist.name).join(', '),
		Credits: value.extraartists
			.map(
				(artist) => `${artist.name}${artist.role ? ` (${artist.role})` : ''}`
			)
			.join(', '),
		Position: value.position,
		Duration: msToMMSS(value.duration),
		BPM: value.bpm,
		RPM: value.rpm,
		Key:
			value.key !== null && value.mode !== null
				? getFormattedKeyString(value.key, value.mode, props.keyFormat)
				: null,
		Genres: value.genres.join(', '),
		'Time signature':
			value.time_signature_upper !== null && value.time_signature_lower !== null
				? `${value.time_signature_upper}/${value.time_signature_lower}`
				: null,
		Playable: value.playable ? 'Yes' : 'No'
	})
	const before = describe(props.baseline)
	return Object.entries(describe(props.latest))
		.filter(([label, value]) => value !== before[label as keyof typeof before])
		.map(([label, value]) => ({
			label,
			value: value === null || value === '' ? 'Not specified' : value
		}))
})
</script>

<template>
	<div
		role="alert"
		class="space-y-3 rounded-md border border-amber-600/30 bg-amber-600/10 p-3 text-sm"
	>
		<p class="font-medium">This track changed while you were editing.</p>
		<template v-if="latest">
			<p>Your edits have been kept. These are the latest saved values:</p>
			<dl
				v-if="changedValues.length"
				class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1"
			>
				<template v-for="change in changedValues" :key="change.label">
					<dt class="font-medium">{{ change.label }}</dt>
					<dd class="min-w-0 wrap-anywhere">{{ change.value }}</dd>
				</template>
			</dl>
			<p v-else>
				Other track data was updated. Your edited fields are unchanged on the
				server.
			</p>
			<p>
				Keep your edits and review them alongside the latest values before
				saving again.
			</p>
			<Button type="button" variant="outline" @click="$emit('review')">
				Keep my edits and review
			</Button>
		</template>
		<p v-else>
			The latest track could not be loaded. Your edits have been kept. Refresh
			your library and reopen the track to review it.
		</p>
	</div>
</template>
