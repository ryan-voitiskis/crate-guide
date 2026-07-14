<script setup lang="ts">
import { ChevronRight, Disc3 } from 'lucide-vue-next'

const props = withDefaults(
	defineProps<{
		crate: Crate
		active?: boolean
	}>(),
	{ active: false }
)

const emit = defineEmits<{ select: [crate: Crate] }>()

const records = useRecordsStore()

const previewRecords = computed(() =>
	records.getRecordsByIds(props.crate.records.slice(0, 3))
)
</script>

<template>
	<button
		type="button"
		class="group relative flex w-full items-center gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0"
		:class="
			active
				? 'bg-primary/8 text-foreground'
				: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
		"
		:aria-current="active ? 'true' : undefined"
		@click="emit('select', crate)"
	>
		<span
			class="h-8 w-1 shrink-0 rounded-full"
			:class="!crate.color && 'bg-border'"
			:style="crate.color ? { backgroundColor: crate.color } : undefined"
		/>

		<span class="min-w-0 flex-1">
			<span class="block truncate text-sm font-medium">{{ crate.name }}</span>
			<span class="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums">
				<Disc3 class="size-3" />
				{{ crate.records.length }}
				<span v-if="previewRecords.length" class="truncate">
					· {{ previewRecords.map((record) => record.title).join(', ') }}
				</span>
			</span>
		</span>

		<ChevronRight
			class="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
			:class="active ? 'text-primary' : 'opacity-45'"
		/>
	</button>
</template>
