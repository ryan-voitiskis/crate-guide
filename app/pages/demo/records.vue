<script setup lang="ts">
import {
	Disc3,
	ExternalLink,
	Grid2X2,
	List,
	Music2,
	Search
} from 'lucide-vue-next'
import {
	type DemoRecord,
	demoRecords,
	getDemoRecordTracks
} from '~/demo/fixtures'

const isActive = usePageActive()
const query = ref('')
const viewMode = ref<'list' | 'covers'>('list')
const selectedRecordId = ref(demoRecords[0]!.id)

const filteredRecords = computed(() => {
	const search = query.value.trim().toLowerCase()
	if (!search) return demoRecords
	return demoRecords.filter((record) =>
		[
			record.title,
			...record.artists,
			record.label,
			record.catno,
			String(record.year)
		].some((value) => value.toLowerCase().includes(search))
	)
})

const selectedRecord = computed(
	() =>
		demoRecords.find((record) => record.id === selectedRecordId.value) ??
		filteredRecords.value[0] ??
		null
)

const selectedTracks = computed(() =>
	selectedRecord.value ? getDemoRecordTracks(selectedRecord.value.id) : []
)

const totalTracks = computed(() =>
	demoRecords.reduce(
		(total, record) => total + getDemoRecordTracks(record.id).length,
		0
	)
)

function selectRecord(record: DemoRecord) {
	selectedRecordId.value = record.id
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
					placeholder="Search demo library"
					class="h-8 pl-8 text-xs"
				/>
			</div>
		</Teleport>

		<div
			class="bg-muted/25 grid shrink-0 grid-cols-2 border-t border-b sm:grid-cols-4"
		>
			<div class="border-r px-3 py-2.5">
				<p class="text-muted-foreground text-[10px] tracking-[0.1em] uppercase">
					Releases
				</p>
				<p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">
					{{ demoRecords.length }}
				</p>
			</div>
			<div class="border-r px-3 py-2.5">
				<p class="text-muted-foreground text-[10px] tracking-[0.1em] uppercase">
					Tracks
				</p>
				<p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">
					{{ totalTracks }}
				</p>
			</div>
			<div class="hidden border-r px-3 py-2.5 sm:block">
				<p class="text-muted-foreground text-[10px] tracking-[0.1em] uppercase">
					Coverage
				</p>
				<p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">100%</p>
			</div>
			<div class="hidden px-3 py-2.5 sm:block">
				<p class="text-muted-foreground text-[10px] tracking-[0.1em] uppercase">
					Source
				</p>
				<p class="mt-1 text-xs font-medium">Curated demo set</p>
			</div>
		</div>

		<div class="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
			<main
				class="flex min-h-0 min-w-0 flex-col border-b lg:border-r lg:border-b-0"
			>
				<div class="flex items-center justify-between gap-3 border-b px-3 py-2">
					<div>
						<h1 class="text-sm font-semibold">Record library</h1>
						<p class="text-muted-foreground text-[11px]">
							{{ filteredRecords.length }} of {{ demoRecords.length }} releases
						</p>
					</div>
					<div class="bg-muted flex rounded-md p-0.5">
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

				<div class="scrollbar-hidden min-h-0 flex-1 overflow-auto">
					<div v-if="viewMode === 'list'" class="min-w-[720px]">
						<div
							class="bg-muted/50 text-muted-foreground sticky top-0 z-[1] grid grid-cols-[48px_minmax(220px,1.6fr)_minmax(140px,1fr)_100px_72px_64px] items-center gap-3 border-b px-3 py-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
						>
							<span>Art</span>
							<span>Release</span>
							<span>Label</span>
							<span>Catalog</span>
							<span>Year</span>
							<span>Tracks</span>
						</div>
						<button
							v-for="record in filteredRecords"
							:key="record.id"
							type="button"
							class="grid w-full grid-cols-[48px_minmax(220px,1.6fr)_minmax(140px,1fr)_100px_72px_64px] items-center gap-3 border-b px-3 py-2 text-left text-xs transition-colors last:border-b-0"
							:class="
								record.id === selectedRecordId
									? 'bg-primary/8'
									: 'hover:bg-muted/45'
							"
							@click="selectRecord(record)"
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
									{{ record.artists.join(', ') }} · {{ record.format }}
								</span>
							</span>
							<span class="truncate">{{ record.label }}</span>
							<span class="font-mono text-[11px] tabular-nums">
								{{ record.catno }}
							</span>
							<span class="font-mono tabular-nums">{{ record.year }}</span>
							<span class="font-mono tabular-nums">
								{{ getDemoRecordTracks(record.id).length }}
							</span>
						</button>
					</div>

					<div
						v-else
						class="grid grid-cols-2 gap-x-3 gap-y-5 p-3 sm:grid-cols-3 xl:grid-cols-5"
					>
						<button
							v-for="record in filteredRecords"
							:key="record.id"
							type="button"
							class="min-w-0 text-left"
							@click="selectRecord(record)"
						>
							<img
								:src="record.cover"
								:alt="`${record.title} cover`"
								class="aspect-square w-full rounded-sm border object-cover shadow-sm transition-transform hover:scale-[1.015]"
								:class="
									record.id === selectedRecordId &&
									'ring-primary ring-2 ring-offset-2'
								"
							/>
							<span class="mt-2 block truncate text-xs font-medium">
								{{ record.title }}
							</span>
							<span class="text-muted-foreground block truncate text-[11px]">
								{{ record.artists.join(', ') }}
							</span>
						</button>
					</div>

					<div
						v-if="!filteredRecords.length"
						class="text-muted-foreground flex min-h-64 items-center justify-center text-sm"
					>
						No releases match “{{ query }}”.
					</div>
				</div>
			</main>

			<aside
				v-if="selectedRecord"
				class="scrollbar-hidden bg-muted/10 min-h-0 overflow-y-auto p-4"
			>
				<div class="grid grid-cols-[112px_minmax(0,1fr)] gap-4 lg:grid-cols-1">
					<img
						:src="selectedRecord.cover"
						:alt="`${selectedRecord.title} cover`"
						class="aspect-square w-full max-w-64 rounded-sm border object-cover shadow-md"
					/>
					<div class="min-w-0 lg:mt-4">
						<p
							class="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase"
						>
							{{ selectedRecord.catno }} · {{ selectedRecord.year }}
						</p>
						<h2 class="mt-1 text-lg leading-tight font-semibold">
							{{ selectedRecord.title }}
						</h2>
						<p class="text-muted-foreground mt-1 text-sm">
							{{ selectedRecord.artists.join(', ') }}
						</p>
						<div class="mt-3 flex flex-wrap gap-1.5">
							<Badge variant="secondary">{{ selectedRecord.label }}</Badge>
							<Badge variant="outline">{{ selectedRecord.format }}</Badge>
						</div>
					</div>
				</div>

				<div class="mt-5 border-t pt-4">
					<div class="mb-2 flex items-center justify-between">
						<p class="text-xs font-semibold tracking-[0.08em] uppercase">
							Tracklist
						</p>
						<span
							class="text-muted-foreground inline-flex items-center gap-1 text-[11px]"
						>
							<Music2 class="size-3" />
							{{ selectedTracks.length }}
						</span>
					</div>
					<div class="divide-y border-y">
						<div
							v-for="track in selectedTracks"
							:key="track.id"
							class="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 py-2 text-xs"
						>
							<span class="text-muted-foreground font-mono text-[10px]">
								{{ track.position }}
							</span>
							<span class="truncate">{{ track.title }}</span>
							<span class="font-mono text-[10px] tabular-nums">
								{{ track.bpm.toFixed(1) }}
							</span>
						</div>
					</div>
				</div>

				<div class="bg-primary/5 border-primary/15 mt-5 rounded-md border p-3">
					<div class="flex items-start gap-2">
						<Disc3 class="text-primary mt-0.5 size-4 shrink-0" />
						<div>
							<p class="text-xs font-semibold">Your collection, your data</p>
							<p class="text-muted-foreground mt-1 text-[11px] leading-relaxed">
								Sign in to import Discogs releases or add your own records
								manually.
							</p>
						</div>
					</div>
					<Button as-child size="sm" class="mt-3 w-full">
						<NuxtLink to="/signup">
							Build your library
							<ExternalLink class="ml-2 size-3.5" />
						</NuxtLink>
					</Button>
				</div>
			</aside>
		</div>
	</div>
</template>
