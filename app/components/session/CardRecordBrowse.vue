<script setup lang="ts">
import { ImageOff } from 'lucide-vue-next'

const props = defineProps<{
	record: DatabaseRecord
}>()

defineEmits<{
	select: []
}>()

const artistNames = computed(() =>
	props.record.artists.map((artist) => artist.name).join(', ')
)

const catalogueNumber = computed(() =>
	props.record.labels.find((label) => label.catno)?.catno?.trim()
)
</script>

<template>
	<button
		type="button"
		data-testid="load-track-record-tile"
		:data-record-id="record.id"
		class="hover:bg-accent focus-visible:ring-ring group w-full rounded-lg border p-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
		@click="$emit('select')"
	>
		<div
			class="bg-muted flex aspect-square w-full items-center justify-center overflow-hidden rounded-none"
		>
			<img
				v-if="record.cover"
				:src="record.cover"
				:alt="`${record.title} cover`"
				class="size-full object-cover"
			/>
			<ImageOff v-else class="text-muted-foreground size-10" />
		</div>
		<div class="min-w-0 px-1 pt-2 pb-1">
			<div class="truncate text-sm font-medium" :title="record.title">
				{{ record.title }}
			</div>
			<div
				v-if="artistNames"
				class="text-muted-foreground truncate text-xs"
				:title="artistNames"
			>
				{{ artistNames }}
			</div>
			<div
				v-if="catalogueNumber"
				class="text-muted-foreground mt-1 truncate font-mono text-xs"
			>
				{{ catalogueNumber }}
			</div>
		</div>
	</button>
</template>
