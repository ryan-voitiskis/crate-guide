<script setup lang="ts">
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
		class="bg-card hover:bg-accent focus-visible:ring-ring group w-full rounded-sm border p-1.5 text-left shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
		@click="$emit('select')"
	>
		<ImageRecordCover
			:record="record"
			class="aspect-square w-full rounded-none"
		/>
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
