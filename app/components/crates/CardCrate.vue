<script setup lang="ts">
import { Disc3, ImageOff } from 'lucide-vue-next'

const props = defineProps<{ crate: Crate }>()
const emit = defineEmits<{ select: [crate: Crate] }>()

const records = useRecordsStore()

const crateRecords = computed(() => {
	const ids = props.crate.records.slice(0, 4)
	return records.getRecordsByIds(ids)
})

const recordCount = computed(() => props.crate.records.length)
</script>

<template>
	<Card
		class="group relative h-32 cursor-pointer overflow-hidden p-0 transition-all hover:shadow-md"
		@click="emit('select', crate)"
	>
		<CardContent class="flex h-full p-0">
			<!-- Left side: Crate info -->
			<div class="flex min-w-0 flex-1 flex-col justify-between p-3">
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<div
							v-if="crate.color"
							class="size-3 shrink-0 rounded-full"
							:style="{ backgroundColor: crate.color }"
						/>
						<h3 class="text-foreground truncate text-sm font-semibold">
							{{ crate.name }}
						</h3>
					</div>
					<p class="text-muted-foreground mt-1 line-clamp-2 text-xs">
						{{ crate.description || 'No description' }}
					</p>
				</div>
				<Badge variant="secondary" class="w-fit">
					<Disc3 class="mr-1 size-3" />
					{{ recordCount }} {{ recordCount === 1 ? 'record' : 'records' }}
				</Badge>
			</div>

			<!-- Right side: Record previews -->
			<div class="flex shrink-0 items-center gap-1 p-2">
				<template v-if="crateRecords.length > 0">
					<div
						v-for="record in crateRecords"
						:key="record.id"
						class="bg-muted flex size-[72px] shrink-0 flex-col overflow-hidden rounded"
					>
						<div
							class="bg-muted h-10 w-full bg-cover bg-center"
							:style="
								record.cover
									? { backgroundImage: `url('${record.cover}')` }
									: {}
							"
						>
							<div
								v-if="!record.cover"
								class="flex h-full items-center justify-center"
							>
								<ImageOff class="text-muted-foreground size-4" />
							</div>
						</div>
						<div class="flex min-w-0 flex-1 flex-col justify-center px-1">
							<span class="text-muted-foreground truncate text-[10px]">
								{{ record.labels[0]?.catno || record.title }}
							</span>
							<span class="text-muted-foreground/70 truncate text-[9px]">
								{{ record.year || '' }}
							</span>
						</div>
					</div>
				</template>
				<div
					v-else
					class="bg-muted/50 text-muted-foreground flex h-[72px] w-24 items-center justify-center rounded text-xs"
				>
					Empty
				</div>
			</div>
		</CardContent>
	</Card>
</template>
