<script setup lang="ts">
import {
	Disc3,
	ExternalLink,
	Folder,
	FolderOpen,
	Grid2X2,
	List,
	Search,
	Sparkles
} from 'lucide-vue-next'
import {
	type DemoCrate,
	demoCrates,
	getDemoRecord,
	getDemoRecordTracks
} from '~/demo/fixtures'

const isActive = usePageActive()
const query = ref('')
const viewMode = ref<'list' | 'covers'>('covers')
const selectedCrateId = ref(demoCrates[1]!.id)

const filteredCrates = computed(() => {
	const search = query.value.trim().toLowerCase()
	if (!search) return demoCrates
	return demoCrates.filter(
		(crate) =>
			crate.name.toLowerCase().includes(search) ||
			crate.description.toLowerCase().includes(search)
	)
})

const selectedCrate = computed(
	() =>
		demoCrates.find((crate) => crate.id === selectedCrateId.value) ??
		filteredCrates.value[0] ??
		null
)

const selectedRecords = computed(() =>
	selectedCrate.value
		? selectedCrate.value.recordIds
				.map((recordId) => getDemoRecord(recordId))
				.filter((record) => record !== undefined)
		: []
)

const selectedTracks = computed(() =>
	selectedRecords.value.flatMap((record) => getDemoRecordTracks(record.id))
)

const bpmSpan = computed(() => {
	if (!selectedTracks.value.length) return '—'
	const bpms = selectedTracks.value.map((track) => track.bpm)
	return `${Math.floor(Math.min(...bpms))}–${Math.ceil(Math.max(...bpms))}`
})

function selectCrate(crate: DemoCrate) {
	selectedCrateId.value = crate.id
}
</script>

<template>
	<div class="flex h-full min-h-0 flex-col">
		<Teleport to="#header-left" defer>
			<div v-if="isActive" class="relative w-48 sm:w-72">
				<Search
					class="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
				/>
				<Input
					v-model="query"
					placeholder="Find a demo crate"
					class="h-8 pl-8 text-xs"
				/>
			</div>
		</Teleport>

		<div
			class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(120px,35%)_minmax(0,1fr)] overflow-hidden border-t lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1"
		>
			<aside
				class="bg-muted/15 flex min-h-0 flex-col border-b lg:border-r lg:border-b-0"
			>
				<div class="border-b p-3">
					<div class="flex items-center gap-2">
						<FolderOpen class="text-primary size-4" />
						<div>
							<p class="text-xs font-semibold tracking-[0.1em] uppercase">
								Set crates
							</p>
							<p class="text-muted-foreground text-[11px]">
								{{ demoCrates.length }} working selections
							</p>
						</div>
					</div>
				</div>

				<div class="scrollbar-hidden min-h-0 overflow-y-auto">
					<button
						v-for="crate in filteredCrates"
						:key="crate.id"
						type="button"
						class="group flex w-full items-center gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0"
						:class="
							crate.id === selectedCrateId
								? 'bg-primary/8'
								: 'hover:bg-muted/55'
						"
						@click="selectCrate(crate)"
					>
						<span
							class="h-8 w-1 shrink-0 rounded-full"
							:style="{ backgroundColor: crate.color }"
						/>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-medium">
								{{ crate.name }}
							</span>
							<span
								class="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]"
							>
								<Disc3 class="size-3" />
								{{ crate.recordIds.length }} releases
							</span>
						</span>
						<Folder
							class="size-3.5 shrink-0"
							:class="
								crate.id === selectedCrateId
									? 'text-primary'
									: 'text-muted-foreground opacity-50'
							"
						/>
					</button>
					<p
						v-if="!filteredCrates.length"
						class="text-muted-foreground p-6 text-center text-xs"
					>
						No crates match “{{ query }}”.
					</p>
				</div>
			</aside>

			<main v-if="selectedCrate" class="flex min-h-0 min-w-0 flex-col">
				<header class="border-b p-4">
					<div
						class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
					>
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<span
									class="size-2.5 rounded-full"
									:style="{ backgroundColor: selectedCrate.color }"
								/>
								<h1 class="truncate text-lg font-semibold">
									{{ selectedCrate.name }}
								</h1>
							</div>
							<p
								class="text-muted-foreground mt-1 max-w-2xl text-xs leading-relaxed"
							>
								{{ selectedCrate.description }}
							</p>
						</div>
						<div class="bg-muted flex shrink-0 rounded-md p-0.5">
							<Button
								:variant="viewMode === 'list' ? 'secondary' : 'ghost'"
								size="icon"
								class="size-7"
								title="List view"
								aria-label="List view"
								@click="viewMode = 'list'"
							>
								<List class="size-3.5" />
							</Button>
							<Button
								:variant="viewMode === 'covers' ? 'secondary' : 'ghost'"
								size="icon"
								class="size-7"
								title="Cover view"
								aria-label="Cover view"
								@click="viewMode = 'covers'"
							>
								<Grid2X2 class="size-3.5" />
							</Button>
						</div>
					</div>

					<div class="mt-4 grid grid-cols-3 border-y sm:max-w-lg">
						<div class="border-r py-2.5">
							<p
								class="text-muted-foreground text-[9px] tracking-[0.1em] uppercase"
							>
								Releases
							</p>
							<p class="mt-0.5 font-mono text-base font-semibold tabular-nums">
								{{ selectedRecords.length }}
							</p>
						</div>
						<div class="border-r px-3 py-2.5">
							<p
								class="text-muted-foreground text-[9px] tracking-[0.1em] uppercase"
							>
								Tracks
							</p>
							<p class="mt-0.5 font-mono text-base font-semibold tabular-nums">
								{{ selectedTracks.length }}
							</p>
						</div>
						<div class="px-3 py-2.5">
							<p
								class="text-muted-foreground text-[9px] tracking-[0.1em] uppercase"
							>
								BPM span
							</p>
							<p class="mt-0.5 font-mono text-base font-semibold tabular-nums">
								{{ bpmSpan }}
							</p>
						</div>
					</div>
				</header>

				<div class="scrollbar-hidden min-h-0 flex-1 overflow-auto">
					<div
						v-if="viewMode === 'covers'"
						class="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6"
					>
						<div
							v-for="record in selectedRecords"
							:key="record.id"
							class="min-w-0"
						>
							<div
								class="relative aspect-square overflow-hidden rounded-sm border shadow-sm"
							>
								<img
									:src="record.cover"
									:alt="`${record.title} cover`"
									class="size-full object-cover"
								/>
								<div
									class="absolute right-1.5 bottom-1.5 rounded-sm bg-black/75 px-1.5 py-0.5 font-mono text-[9px] text-white backdrop-blur"
								>
									{{ getDemoRecordTracks(record.id).length }} TRK
								</div>
							</div>
							<p class="mt-2 truncate text-xs font-medium">
								{{ record.title }}
							</p>
							<p class="text-muted-foreground truncate font-mono text-[10px]">
								{{ record.catno }} · {{ record.year }}
							</p>
						</div>
					</div>

					<div v-else class="min-w-[700px]">
						<div
							class="bg-muted/50 text-muted-foreground sticky top-0 grid grid-cols-[44px_minmax(220px,1.5fr)_minmax(150px,1fr)_100px_70px_70px] items-center gap-3 border-b px-3 py-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
						>
							<span>Art</span>
							<span>Release</span>
							<span>Label</span>
							<span>Catalog</span>
							<span>Year</span>
							<span>Tracks</span>
						</div>
						<div
							v-for="record in selectedRecords"
							:key="record.id"
							class="hover:bg-muted/45 grid grid-cols-[44px_minmax(220px,1.5fr)_minmax(150px,1fr)_100px_70px_70px] items-center gap-3 border-b px-3 py-2 text-xs transition-colors last:border-b-0"
						>
							<img
								:src="record.cover"
								:alt="`${record.title} cover`"
								class="size-9 rounded-sm border object-cover"
							/>
							<span class="min-w-0">
								<span class="block truncate font-medium">
									{{ record.title }}
								</span>
								<span class="text-muted-foreground block truncate text-[11px]">
									{{ record.artists.join(', ') }}
								</span>
							</span>
							<span class="truncate">{{ record.label }}</span>
							<span class="font-mono text-[11px]">{{ record.catno }}</span>
							<span class="font-mono">{{ record.year }}</span>
							<span class="font-mono">
								{{ getDemoRecordTracks(record.id).length }}
							</span>
						</div>
					</div>
				</div>

				<footer
					class="bg-muted/20 flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="flex items-start gap-2">
						<Sparkles class="text-primary mt-0.5 size-4 shrink-0" />
						<div>
							<p class="text-xs font-medium">Crates stay lightweight</p>
							<p class="text-muted-foreground text-[11px]">
								One record can live in several set ideas without duplicating
								library data.
							</p>
						</div>
					</div>
					<Button as-child size="sm" class="shrink-0">
						<NuxtLink to="/signup">
							Organize your collection
							<ExternalLink class="ml-2 size-3.5" />
						</NuxtLink>
					</Button>
				</footer>
			</main>
		</div>
	</div>
</template>
