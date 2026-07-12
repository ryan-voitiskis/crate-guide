<script setup lang="ts">
import { ImageOff, X } from 'lucide-vue-next'

defineProps<{
	records: DatabaseRecord[]
}>()

const emit = defineEmits<{
	remove: [recordId: string]
}>()
</script>

<template>
	<div class="space-y-2">
		<div
			v-for="record in records"
			:key="record.id"
			class="bg-card hover:bg-accent group flex items-center gap-3 rounded-lg border p-2 transition-colors"
		>
			<!-- Cover -->
			<div
				class="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-cover bg-center"
				:style="
					record.cover ? { backgroundImage: `url('${record.cover}')` } : {}
				"
			>
				<ImageOff v-if="!record.cover" class="text-muted-foreground size-4" />
			</div>

			<!-- Info -->
			<div class="min-w-0 flex-1">
				<p class="text-foreground truncate text-sm font-medium">
					{{ record.title }}
				</p>
				<p class="text-muted-foreground truncate text-xs">
					{{ record.artists.map((a) => a.name).join(', ') }}
				</p>
				<div class="text-muted-foreground flex items-center gap-2 text-xs">
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
				class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
				title="Remove from crate"
				aria-label="Remove from crate"
				@click="emit('remove', record.id)"
			>
				<X class="size-4" />
			</Button>
		</div>
	</div>
</template>
