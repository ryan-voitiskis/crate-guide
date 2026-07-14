<script setup lang="ts">
import {
	ArrowDown,
	ArrowUp,
	CheckCircle2,
	CircleSlash2,
	Disc3,
	ExternalLink,
	Gauge,
	KeyRound,
	Search
} from 'lucide-vue-next'
import {
	type DemoTrack,
	demoTracks,
	formatDemoDuration,
	getDemoRecord
} from '~/demo/fixtures'

type SortKey = 'position' | 'title' | 'artists' | 'duration' | 'bpm' | 'key'

const isActive = usePageActive()
const query = ref('')
const genreFilter = ref('all')
const selectedTrackId = ref(demoTracks[0]!.id)
const sortKey = ref<SortKey>('bpm')
const sortDirection = ref<'asc' | 'desc'>('asc')

const genres = computed(() => [
	'all',
	...new Set(demoTracks.flatMap((track) => track.genres))
])

const visibleTracks = computed(() => {
	const search = query.value.trim().toLowerCase()
	const filtered = demoTracks.filter((track) => {
		const record = getDemoRecord(track.recordId)
		const matchesGenre =
			genreFilter.value === 'all' || track.genres.includes(genreFilter.value)
		const matchesSearch =
			!search ||
			[
				track.title,
				...track.artists,
				...track.genres,
				track.key,
				String(track.bpm),
				record?.title ?? '',
				record?.catno ?? ''
			].some((value) => value.toLowerCase().includes(search))
		return matchesGenre && matchesSearch
	})

	return [...filtered].sort((a, b) => {
		const aValue = sortValue(a, sortKey.value)
		const bValue = sortValue(b, sortKey.value)
		const comparison =
			typeof aValue === 'number' && typeof bValue === 'number'
				? aValue - bValue
				: String(aValue).localeCompare(String(bValue))
		return sortDirection.value === 'asc' ? comparison : -comparison
	})
})

const selectedTrack = computed(
	() =>
		demoTracks.find((track) => track.id === selectedTrackId.value) ??
		visibleTracks.value[0] ??
		null
)

const selectedRecord = computed(() =>
	selectedTrack.value ? getDemoRecord(selectedTrack.value.recordId) : null
)

const averageBpm = computed(
	() =>
		demoTracks.reduce((total, track) => total + track.bpm, 0) /
		demoTracks.length
)

function sortValue(track: DemoTrack, key: SortKey) {
	if (key === 'artists') return track.artists.join(', ')
	return track[key]
}

function setSort(key: SortKey) {
	if (sortKey.value === key) {
		sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
	} else {
		sortKey.value = key
		sortDirection.value = 'asc'
	}
}

function selectTrack(track: DemoTrack) {
	selectedTrackId.value = track.id
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
					placeholder="Search tracks, BPM or key"
					class="h-8 pl-8 text-xs"
				/>
			</div>
		</Teleport>

		<div
			class="bg-muted/25 grid shrink-0 grid-cols-3 border-t border-b md:grid-cols-5"
		>
			<div class="border-r px-3 py-2.5">
				<p class="text-muted-foreground text-[10px] tracking-[0.1em] uppercase">
					Tracks
				</p>
				<p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">
					{{ demoTracks.length }}
				</p>
			</div>
			<div class="border-r px-3 py-2.5">
				<p class="text-muted-foreground text-[10px] tracking-[0.1em] uppercase">
					Avg BPM
				</p>
				<p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">
					{{ averageBpm.toFixed(1) }}
				</p>
			</div>
			<div class="border-r px-3 py-2.5">
				<p class="text-muted-foreground text-[10px] tracking-[0.1em] uppercase">
					Analyzed
				</p>
				<p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">100%</p>
			</div>
			<div class="hidden border-r px-3 py-2.5 md:block">
				<p class="text-muted-foreground text-[10px] tracking-[0.1em] uppercase">
					BPM span
				</p>
				<p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">
					98–134
				</p>
			</div>
			<div class="hidden px-3 py-2.5 md:block">
				<p class="text-muted-foreground text-[10px] tracking-[0.1em] uppercase">
					Key format
				</p>
				<p class="mt-1 text-xs font-medium">Camelot</p>
			</div>
		</div>

		<div
			class="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-3 py-2"
		>
			<span
				class="text-muted-foreground mr-1 shrink-0 text-[10px] font-semibold tracking-[0.08em] uppercase"
			>
				Genre
			</span>
			<Button
				v-for="genre in genres"
				:key="genre"
				:variant="genreFilter === genre ? 'secondary' : 'ghost'"
				size="sm"
				class="h-7 shrink-0 px-2.5 text-[11px]"
				@click="genreFilter = genre"
			>
				{{ genre === 'all' ? 'All' : genre }}
			</Button>
		</div>

		<div class="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
			<main
				class="scrollbar-hidden min-h-0 min-w-0 overflow-auto border-b lg:border-r lg:border-b-0"
			>
				<div class="min-w-[900px]">
					<div
						class="bg-muted/60 text-muted-foreground sticky top-0 z-[1] grid grid-cols-[42px_46px_minmax(220px,1.5fr)_minmax(150px,1fr)_76px_80px_76px_90px] items-center gap-3 border-b px-3 py-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase backdrop-blur"
					>
						<span>Art</span>
						<button
							class="flex items-center gap-1 text-left"
							@click="setSort('position')"
						>
							Pos
							<ArrowUp
								v-if="sortKey === 'position' && sortDirection === 'asc'"
								class="size-3"
							/>
							<ArrowDown v-else-if="sortKey === 'position'" class="size-3" />
						</button>
						<button
							class="flex items-center gap-1 text-left"
							@click="setSort('title')"
						>
							Title
							<ArrowUp
								v-if="sortKey === 'title' && sortDirection === 'asc'"
								class="size-3"
							/>
							<ArrowDown v-else-if="sortKey === 'title'" class="size-3" />
						</button>
						<button
							class="flex items-center gap-1 text-left"
							@click="setSort('artists')"
						>
							Artist
							<ArrowUp
								v-if="sortKey === 'artists' && sortDirection === 'asc'"
								class="size-3"
							/>
							<ArrowDown v-else-if="sortKey === 'artists'" class="size-3" />
						</button>
						<button
							class="flex items-center gap-1 text-left"
							@click="setSort('duration')"
						>
							Time
							<ArrowUp
								v-if="sortKey === 'duration' && sortDirection === 'asc'"
								class="size-3"
							/>
							<ArrowDown v-else-if="sortKey === 'duration'" class="size-3" />
						</button>
						<button
							class="flex items-center gap-1 text-left"
							@click="setSort('bpm')"
						>
							BPM
							<ArrowUp
								v-if="sortKey === 'bpm' && sortDirection === 'asc'"
								class="size-3"
							/>
							<ArrowDown v-else-if="sortKey === 'bpm'" class="size-3" />
						</button>
						<button
							class="flex items-center gap-1 text-left"
							@click="setSort('key')"
						>
							Key
							<ArrowUp
								v-if="sortKey === 'key' && sortDirection === 'asc'"
								class="size-3"
							/>
							<ArrowDown v-else-if="sortKey === 'key'" class="size-3" />
						</button>
						<span>Genre</span>
					</div>

					<button
						v-for="track in visibleTracks"
						:key="track.id"
						type="button"
						class="grid w-full grid-cols-[42px_46px_minmax(220px,1.5fr)_minmax(150px,1fr)_76px_80px_76px_90px] items-center gap-3 border-b px-3 py-2 text-left text-xs transition-colors last:border-b-0"
						:class="
							track.id === selectedTrackId
								? 'bg-primary/8'
								: 'hover:bg-muted/45'
						"
						@click="selectTrack(track)"
					>
						<img
							:src="getDemoRecord(track.recordId)?.cover"
							:alt="`${getDemoRecord(track.recordId)?.title} cover`"
							class="size-8 rounded-sm border object-cover"
						/>
						<span class="text-muted-foreground font-mono text-[10px]">
							{{ track.position }}
						</span>
						<span class="min-w-0">
							<span class="block truncate font-medium">{{ track.title }}</span>
							<span class="text-muted-foreground block truncate text-[10px]">
								{{ getDemoRecord(track.recordId)?.title }}
							</span>
						</span>
						<span class="truncate">{{ track.artists.join(', ') }}</span>
						<span class="font-mono text-[11px] tabular-nums">
							{{ formatDemoDuration(track.duration) }}
						</span>
						<span class="font-mono font-medium tabular-nums">
							{{ track.bpm.toFixed(1) }}
						</span>
						<span
							class="font-mono font-semibold"
							:style="{ color: track.keyColor }"
						>
							{{ track.key }}
						</span>
						<span class="truncate text-[11px]">{{ track.genres[0] }}</span>
					</button>
				</div>

				<div
					v-if="!visibleTracks.length"
					class="text-muted-foreground flex min-h-64 items-center justify-center text-sm"
				>
					No tracks match the current filters.
				</div>
			</main>

			<aside
				v-if="selectedTrack && selectedRecord"
				class="scrollbar-hidden bg-muted/10 min-h-0 overflow-y-auto p-4"
			>
				<div class="flex gap-3">
					<img
						:src="selectedRecord.cover"
						:alt="`${selectedRecord.title} cover`"
						class="size-24 rounded-sm border object-cover shadow-sm"
					/>
					<div class="min-w-0">
						<p
							class="text-muted-foreground font-mono text-[10px] tracking-[0.1em] uppercase"
						>
							{{ selectedRecord.catno }} · {{ selectedTrack.position }}
						</p>
						<h2 class="mt-1 text-base leading-tight font-semibold">
							{{ selectedTrack.title }}
						</h2>
						<p class="text-muted-foreground mt-1 text-xs">
							{{ selectedTrack.artists.join(', ') }}
						</p>
						<div class="mt-2 flex flex-wrap gap-1">
							<Badge
								v-for="genre in selectedTrack.genres"
								:key="genre"
								variant="secondary"
							>
								{{ genre }}
							</Badge>
						</div>
					</div>
				</div>

				<div class="mt-5 grid grid-cols-3 border-y">
					<div class="border-r py-3 text-center">
						<Gauge class="text-muted-foreground mx-auto size-3.5" />
						<p class="mt-1 font-mono text-lg font-semibold tabular-nums">
							{{ selectedTrack.bpm.toFixed(1) }}
						</p>
						<p
							class="text-muted-foreground text-[9px] tracking-[0.08em] uppercase"
						>
							BPM
						</p>
					</div>
					<div class="border-r py-3 text-center">
						<KeyRound
							class="mx-auto size-3.5"
							:style="{ color: selectedTrack.keyColor }"
						/>
						<p
							class="mt-1 font-mono text-lg font-semibold"
							:style="{ color: selectedTrack.keyColor }"
						>
							{{ selectedTrack.key }}
						</p>
						<p
							class="text-muted-foreground text-[9px] tracking-[0.08em] uppercase"
						>
							Key
						</p>
					</div>
					<div class="py-3 text-center">
						<CheckCircle2
							v-if="selectedTrack.playable"
							class="mx-auto size-3.5 text-emerald-500"
						/>
						<CircleSlash2
							v-else
							class="text-muted-foreground mx-auto size-3.5"
						/>
						<p class="mt-1 font-mono text-lg font-semibold">
							{{ formatDemoDuration(selectedTrack.duration) }}
						</p>
						<p
							class="text-muted-foreground text-[9px] tracking-[0.08em] uppercase"
						>
							Time
						</p>
					</div>
				</div>

				<dl
					class="mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs"
				>
					<dt class="text-muted-foreground">Release</dt>
					<dd class="truncate font-medium">{{ selectedRecord.title }}</dd>
					<dt class="text-muted-foreground">Label</dt>
					<dd class="truncate">{{ selectedRecord.label }}</dd>
					<dt class="text-muted-foreground">Catalog</dt>
					<dd class="font-mono text-[11px]">{{ selectedRecord.catno }}</dd>
					<dt class="text-muted-foreground">Year</dt>
					<dd class="font-mono">{{ selectedRecord.year }}</dd>
					<dt class="text-muted-foreground">Playable</dt>
					<dd>
						{{
							selectedTrack.playable
								? 'Included in suggestions'
								: 'Excluded from suggestions'
						}}
					</dd>
				</dl>

				<div class="bg-primary/5 border-primary/15 mt-5 rounded-md border p-3">
					<div class="flex items-start gap-2">
						<Disc3 class="text-primary mt-0.5 size-4 shrink-0" />
						<p class="text-muted-foreground text-[11px] leading-relaxed">
							Tracks inherit release context while keeping performance
							metadata—BPM, key, duration and playability—close at hand.
						</p>
					</div>
					<Button as-child size="sm" class="mt-3 w-full">
						<NuxtLink to="/signup">
							Try it with your records
							<ExternalLink class="ml-2 size-3.5" />
						</NuxtLink>
					</Button>
				</div>
			</aside>
		</div>
	</div>
</template>
