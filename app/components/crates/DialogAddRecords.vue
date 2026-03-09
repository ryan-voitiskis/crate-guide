<script setup lang="ts">
import { ImageOff, Plus, Search } from 'lucide-vue-next'

const props = defineProps<{
	open: boolean
	crate: Crate
}>()

const emit = defineEmits<{
	'update:open': [value: boolean]
}>()

const recordsStore = useRecordsStore()
const cratesStore = useCratesStore()

const searchQuery = ref('')
const addingRecordId = ref<string | null>(null)

// Filter records based on search and exclude already in crate
const filteredRecords = computed(() => {
	const crateRecordIds = new Set(props.crate.records)
	let records = recordsStore.records.filter((r) => !crateRecordIds.has(r.id))

	if (searchQuery.value.trim()) {
		const query = searchQuery.value.toLowerCase()
		records = records.filter(
			(record) =>
				record.title.toLowerCase().includes(query) ||
				record.artists.some((a) => a.name.toLowerCase().includes(query)) ||
				record.labels.some(
					(l) =>
						l.name?.toLowerCase().includes(query) ||
						l.catno?.toLowerCase().includes(query)
				) ||
				record.year?.toString().includes(query)
		)
	}

	return records
})

const availableCount = computed(() => {
	const crateRecordIds = new Set(props.crate.records)
	return recordsStore.records.filter((r) => !crateRecordIds.has(r.id)).length
})

async function addRecord(recordId: string) {
	addingRecordId.value = recordId
	try {
		await cratesStore.addRecordToCrate(props.crate.id, recordId, {
			silent: true
		})
	} finally {
		addingRecordId.value = null
	}
}

function handleClose() {
	searchQuery.value = ''
	emit('update:open', false)
}

// Reset search when dialog opens
watch(
	() => props.open,
	(open) => {
		if (open) {
			searchQuery.value = ''
		}
	}
)
</script>

<template>
	<Dialog :open="open" @update:open="handleClose">
		<DialogContent
			class="flex h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0"
		>
			<DialogHeader class="min-w-0 shrink-0 space-y-3 border-b p-6 pb-4">
				<DialogTitle>Add Records</DialogTitle>
				<DialogDescription>Add records to "{{ crate.name }}"</DialogDescription>

				<!-- Search -->
				<div class="relative w-full max-w-full">
					<Search
						class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
					/>
					<Input
						v-model="searchQuery"
						placeholder="Search records..."
						class="w-full max-w-full pl-10"
					/>
				</div>

				<!-- Count -->
				<div class="text-muted-foreground text-sm">
					{{ filteredRecords.length }} of {{ availableCount }} available
				</div>
			</DialogHeader>

			<!-- Record List -->
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden py-4 pr-4 pl-6">
				<div
					v-if="filteredRecords.length === 0"
					class="flex h-full flex-col items-center justify-center text-center"
				>
					<p class="text-muted-foreground text-sm">
						{{
							searchQuery
								? 'No records match your search'
								: 'All records are already in this crate'
						}}
					</p>
				</div>

				<ScrollArea v-else class="h-full">
					<TransitionGroup name="record-list" tag="div" class="space-y-1 pr-4">
						<div
							v-for="record in filteredRecords"
							:key="record.id"
							class="hover:bg-accent flex items-center gap-3 rounded-lg border p-2 transition-colors"
						>
							<!-- Cover -->
							<div
								class="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-cover bg-center"
								:style="
									record.cover
										? { backgroundImage: `url('${record.cover}')` }
										: {}
								"
							>
								<ImageOff
									v-if="!record.cover"
									class="text-muted-foreground size-4"
								/>
							</div>

							<!-- Info -->
							<div class="min-w-0 flex-1">
								<p class="text-foreground truncate text-sm font-medium">
									{{ record.title }}
								</p>
								<p class="text-muted-foreground truncate text-xs">
									{{ record.artists.map((a) => a.name).join(', ') }}
								</p>
								<div
									class="text-muted-foreground flex items-center gap-2 text-xs"
								>
									<span v-if="record.labels[0]?.catno" class="font-medium">
										{{ record.labels[0].catno }}
									</span>
									<span v-if="record.year">{{ record.year }}</span>
								</div>
							</div>

							<!-- Add Button -->
							<Button
								variant="ghost"
								size="icon"
								:loading="addingRecordId === record.id"
								title="Add to crate"
								aria-label="Add to crate"
								@click="addRecord(record.id)"
							>
								<Plus class="size-4" />
							</Button>
						</div>
					</TransitionGroup>
				</ScrollArea>
			</div>

			<!-- Footer -->
			<DialogFooter
				class="bg-background relative z-10 shrink-0 border-t p-6 pt-4"
			>
				<Button variant="secondary" @click="handleClose">Done</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
