<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{
	records: DatabaseRecord[]
}>()

const emit = defineEmits<{
	remove: [recordId: string]
}>()
</script>

<template>
	<div class="divide-y border-y">
		<div
			v-for="record in records"
			:key="record.id"
			class="hover:bg-muted/45 group grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-2 pr-1 transition-colors"
		>
			<!-- Cover -->
			<ImageRecordCover
				:record="record"
				class="size-10 shrink-0 rounded-sm border"
			/>

			<!-- Info -->
			<div class="min-w-0 flex-1">
				<p class="text-foreground truncate text-xs font-medium">
					{{ record.title }}
				</p>
				<p class="text-muted-foreground truncate text-xs">
					{{ record.artists.map((a) => a.name).join(', ') }}
				</p>
				<div
					class="text-muted-foreground mt-0.5 flex items-center gap-2 font-mono text-[10px]"
				>
					<span v-if="record.labels[0]?.catno" class="font-medium">
						{{ record.labels[0].catno }}
					</span>
					<span v-if="record.year">{{ record.year }}</span>
				</div>
			</div>

			<!-- Remove Button -->
			<Button
				variant="ghost"
				size="icon"
				class="size-8 shrink-0 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus:opacity-100"
				title="Remove from crate"
				aria-label="Remove from crate"
				@click="emit('remove', record.id)"
			>
				<X class="size-4" />
			</Button>
		</div>
	</div>
</template>
