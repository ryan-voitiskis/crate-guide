<script setup lang="ts">
defineProps<{
	entity: 'record' | 'crate'
	hasLatest: boolean
	changes: { label: string; value: string }[]
}>()
defineEmits<{ review: [] }>()
</script>

<template>
	<div
		role="alert"
		class="space-y-3 rounded-md border border-amber-600/30 bg-amber-600/10 p-3 text-sm"
	>
		<p class="font-medium">This {{ entity }} changed while you were editing.</p>
		<template v-if="hasLatest">
			<p>Your edits have been kept. These are the latest saved values:</p>
			<dl
				v-if="changes.length"
				class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1"
			>
				<template v-for="change in changes" :key="change.label">
					<dt class="font-medium">{{ change.label }}</dt>
					<dd class="min-w-0 wrap-anywhere">{{ change.value }}</dd>
				</template>
			</dl>
			<p v-else>
				Other {{ entity }} data was updated. Your edited fields are unchanged in
				the saved version.
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
			The latest {{ entity }} could not be loaded. Your edits have been kept.
			Refresh your library and reopen the {{ entity }} to review it.
		</p>
	</div>
</template>
