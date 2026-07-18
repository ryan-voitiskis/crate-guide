<script setup lang="ts">
import {
	ArrowRight,
	Check,
	Clock3,
	ExternalLink,
	Gauge,
	History,
	ListMusic,
	Radio,
	Sparkles
} from 'lucide-vue-next'
import {
	demoHistory,
	demoTracks,
	formatDemoDuration,
	getDemoRecord,
	getDemoTrack
} from '~/demo/fixtures'

type DemoDeckId = 'A' | 'B'

const isActive = usePageActive()
const activeDeck = ref<DemoDeckId>('B')
const deckTrackIds = reactive<Record<DemoDeckId, string>>({
	A: 'track-nightglass',
	B: 'track-signal'
})

const suggestionScores: Record<string, number> = {
	'track-trace': 96,
	'track-petal': 92,
	'track-aurora': 88,
	'track-courtyard': 84,
	'track-redline': 78,
	'track-arc': 74
}

const suggestions = computed(() =>
	demoTracks
		.filter((track) => track.id in suggestionScores)
		.map((track) => ({
			track,
			score: suggestionScores[track.id]!,
			record: getDemoRecord(track.recordId)
		}))
		.sort((a, b) => b.score - a.score)
)

const activeTrack = computed(() => getDemoTrack(deckTrackIds[activeDeck.value]))

function loadSuggestion(trackId: string) {
	deckTrackIds[activeDeck.value] = trackId
}

function scoreColor(score: number) {
	if (score >= 90) return '#22c55e'
	if (score >= 80) return '#eab308'
	return '#f97316'
}
</script>

<template>
	<div class="flex h-full min-h-0 flex-col">
		<Teleport to="#header-left" defer>
			<div v-if="isActive" class="flex items-center gap-2">
				<span
					class="border-primary/20 bg-primary/5 text-primary inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium"
				>
					<span class="relative flex size-2">
						<span
							class="bg-primary absolute inline-flex size-full animate-ping rounded-full opacity-50"
						/>
						<span class="bg-primary relative inline-flex size-2 rounded-full" />
					</span>
					Session preview
				</span>
			</div>
		</Teleport>

		<div
			class="bg-muted/25 grid shrink-0 grid-cols-2 border-t border-b sm:grid-cols-4"
		>
			<div class="border-r px-3 py-2.5">
				<p
					class="text-muted-foreground flex items-center gap-1.5 text-[10px] tracking-[0.1em] uppercase"
				>
					<Clock3 class="size-3" />
					Elapsed
				</p>
				<p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">
					00:27:18
				</p>
			</div>
			<div class="border-r px-3 py-2.5">
				<p
					class="text-muted-foreground flex items-center gap-1.5 text-[10px] tracking-[0.1em] uppercase"
				>
					<Gauge class="size-3" />
					Master
				</p>
				<p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">
					127.6
					<span class="text-muted-foreground text-[10px] font-normal">BPM</span>
				</p>
			</div>
			<div class="hidden border-r px-3 py-2.5 sm:block">
				<p
					class="text-muted-foreground flex items-center gap-1.5 text-[10px] tracking-[0.1em] uppercase"
				>
					<History class="size-3" />
					Played
				</p>
				<p class="mt-0.5 font-mono text-lg font-semibold tabular-nums">
					{{ demoHistory.length }}
				</p>
			</div>
			<div class="hidden px-3 py-2.5 sm:block">
				<p
					class="text-muted-foreground flex items-center gap-1.5 text-[10px] tracking-[0.1em] uppercase"
				>
					<Sparkles class="size-3" />
					Model
				</p>
				<p class="mt-1 text-xs font-medium">Tempo + harmonic fit</p>
			</div>
		</div>

		<section class="grid shrink-0 border-b md:grid-cols-2">
			<button
				v-for="deckId in ['A', 'B'] as const"
				:key="deckId"
				type="button"
				class="group relative flex min-w-0 items-center gap-3 p-3 text-left transition-colors first:border-b md:first:border-r md:first:border-b-0"
				:class="activeDeck === deckId ? 'bg-primary/6' : 'hover:bg-muted/35'"
				@click="activeDeck = deckId"
			>
				<span
					class="absolute inset-x-0 bottom-0 h-0.5 md:inset-y-0 md:right-auto md:h-auto md:w-0.5"
					:class="activeDeck === deckId ? 'bg-primary' : 'bg-transparent'"
				/>
				<img
					:src="
						getDemoRecord(getDemoTrack(deckTrackIds[deckId])!.recordId)?.cover
					"
					:alt="`${getDemoTrack(deckTrackIds[deckId])?.title} cover`"
					class="size-16 shrink-0 rounded-sm border object-cover shadow-sm"
				/>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span
							class="bg-foreground text-background rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-bold"
						>
							DECK {{ deckId }}
						</span>
						<span
							v-if="activeDeck === deckId"
							class="text-primary text-[10px] font-semibold tracking-[0.08em] uppercase"
						>
							Suggestion target
						</span>
					</div>
					<p class="mt-1.5 truncate text-sm font-semibold">
						{{ getDemoTrack(deckTrackIds[deckId])?.title }}
					</p>
					<p class="text-muted-foreground truncate text-xs">
						{{ getDemoTrack(deckTrackIds[deckId])?.artists.join(', ') }}
					</p>
				</div>
				<div
					class="grid shrink-0 grid-cols-2 divide-x border-l pl-3 text-center"
				>
					<div class="px-2">
						<p class="font-mono text-base font-semibold tabular-nums">
							{{ getDemoTrack(deckTrackIds[deckId])?.bpm.toFixed(1) }}
						</p>
						<p
							class="text-muted-foreground text-[9px] tracking-[0.1em] uppercase"
						>
							BPM
						</p>
					</div>
					<div class="px-2">
						<p
							class="font-mono text-base font-semibold"
							:style="{ color: getDemoTrack(deckTrackIds[deckId])?.keyColor }"
						>
							{{ getDemoTrack(deckTrackIds[deckId])?.key }}
						</p>
						<p
							class="text-muted-foreground text-[9px] tracking-[0.1em] uppercase"
						>
							Key
						</p>
					</div>
				</div>
			</button>
		</section>

		<div class="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
			<main
				class="flex min-h-0 min-w-0 flex-col border-b lg:border-r lg:border-b-0"
			>
				<div
					class="flex items-center justify-between gap-3 border-b px-3 py-2.5"
				>
					<div class="flex items-center gap-2">
						<ListMusic class="text-primary size-4" />
						<div>
							<h1 class="text-sm font-semibold">Next-track suggestions</h1>
							<p class="text-muted-foreground text-[11px]">
								Ranked against Deck {{ activeDeck }} ·
								{{ activeTrack?.bpm.toFixed(1) }} BPM · {{ activeTrack?.key }}
							</p>
						</div>
					</div>
					<Badge variant="outline" class="font-mono text-[10px]">
						6 MATCHES
					</Badge>
				</div>

				<div class="scrollbar-hidden min-h-0 flex-1 overflow-auto">
					<div class="min-w-[720px]">
						<div
							class="bg-muted/55 text-muted-foreground sticky top-0 z-[1] grid grid-cols-[42px_minmax(220px,1.5fr)_72px_64px_72px_minmax(120px,1fr)_78px] items-center gap-3 border-b px-3 py-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
						>
							<span>Art</span>
							<span>Track</span>
							<span>BPM</span>
							<span>Key</span>
							<span>Pitch</span>
							<span>Match</span>
							<span>Load</span>
						</div>
						<button
							v-for="suggestion in suggestions"
							:key="suggestion.track.id"
							type="button"
							class="hover:bg-muted/45 group grid w-full grid-cols-[42px_minmax(220px,1.5fr)_72px_64px_72px_minmax(120px,1fr)_78px] items-center gap-3 border-b px-3 py-2 text-left text-xs transition-colors last:border-b-0"
							@click="loadSuggestion(suggestion.track.id)"
						>
							<img
								:src="suggestion.record?.cover"
								:alt="`${suggestion.track.title} cover`"
								class="size-8 rounded-sm border object-cover"
							/>
							<span class="min-w-0">
								<span class="block truncate font-medium">
									{{ suggestion.track.title }}
								</span>
								<span class="text-muted-foreground block truncate text-[10px]">
									{{ suggestion.track.artists.join(', ') }} ·
									{{ suggestion.record?.catno }}
								</span>
							</span>
							<span class="font-mono font-medium tabular-nums">
								{{ suggestion.track.bpm.toFixed(1) }}
							</span>
							<span
								class="font-mono font-semibold"
								:style="{ color: suggestion.track.keyColor }"
							>
								{{ suggestion.track.key }}
							</span>
							<span
								class="font-mono text-[11px] tabular-nums"
								:class="
									Math.abs(suggestion.track.bpm - (activeTrack?.bpm ?? 0)) < 2
										? 'text-emerald-500'
										: 'text-amber-500'
								"
							>
								{{ suggestion.track.bpm >= (activeTrack?.bpm ?? 0) ? '+' : ''
								}}{{
									(
										(suggestion.track.bpm / (activeTrack?.bpm ?? 1) - 1) *
										100
									).toFixed(1)
								}}%
							</span>
							<span class="flex items-center gap-2">
								<span
									class="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
								>
									<span
										class="block h-full rounded-full"
										:style="{
											width: `${suggestion.score}%`,
											backgroundColor: scoreColor(suggestion.score)
										}"
									/>
								</span>
								<span
									class="w-7 font-mono font-semibold tabular-nums"
									:style="{ color: scoreColor(suggestion.score) }"
								>
									{{ suggestion.score }}
								</span>
							</span>
							<span
								class="inline-flex items-center justify-end gap-1 text-[10px] font-semibold tracking-[0.06em] uppercase opacity-60 group-hover:opacity-100"
							>
								Deck {{ activeDeck }}
								<ArrowRight class="size-3" />
							</span>
						</button>
					</div>
				</div>
			</main>

			<aside class="scrollbar-hidden bg-muted/10 min-h-0 overflow-y-auto">
				<div class="flex items-center justify-between border-b px-3 py-2.5">
					<div class="flex items-center gap-2">
						<History class="text-primary size-4" />
						<h2 class="text-sm font-semibold">Session history</h2>
					</div>
					<span class="text-muted-foreground font-mono text-[10px]">LIVE</span>
				</div>
				<div class="divide-y px-3">
					<div
						v-for="(entry, index) in demoHistory"
						:key="entry.trackId"
						class="py-3"
					>
						<div class="flex items-start gap-2.5">
							<span
								class="bg-foreground text-background flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[9px]"
							>
								{{ index + 1 }}
							</span>
							<div class="min-w-0 flex-1">
								<div class="flex items-start justify-between gap-2">
									<p class="truncate text-xs font-medium">
										{{ getDemoTrack(entry.trackId)?.title }}
									</p>
									<span
										class="text-muted-foreground shrink-0 font-mono text-[10px]"
									>
										{{ entry.playedAt }}
									</span>
								</div>
								<p class="text-muted-foreground mt-0.5 truncate text-[11px]">
									{{ getDemoTrack(entry.trackId)?.artists.join(', ') }}
								</p>
								<div class="mt-1.5 flex items-center justify-between">
									<span class="text-muted-foreground font-mono text-[10px]">
										{{ entry.adjustedBpm.toFixed(1) }} BPM ·
										{{ getDemoTrack(entry.trackId)?.key }}
									</span>
									<span v-if="entry.rating" class="flex gap-0.5">
										<Check
											v-for="rating in entry.rating"
											:key="rating"
											class="size-2.5 text-emerald-500"
										/>
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="m-3 rounded-md border p-3">
					<div class="flex items-start gap-2">
						<Radio class="text-primary mt-0.5 size-4 shrink-0" />
						<div>
							<p class="text-xs font-semibold">A planning aid, not autopilot</p>
							<p class="text-muted-foreground mt-1 text-[11px] leading-relaxed">
								Suggestions surface tempo, key and pitch trade-offs. You stay in
								control of selection and timing.
							</p>
						</div>
					</div>
					<Button as-child size="sm" class="mt-3 w-full">
						<NuxtLink to="/signup?redirect=%2F">
							Start a real session
							<ExternalLink class="ml-2 size-3.5" />
						</NuxtLink>
					</Button>
				</div>
			</aside>
		</div>

		<div
			class="bg-background text-muted-foreground flex shrink-0 items-center justify-between border-t px-3 py-1.5 font-mono text-[9px] tracking-[0.06em] uppercase"
		>
			<span>Demo state is local and resets on refresh</span>
			<span>
				{{ formatDemoDuration(activeTrack?.duration ?? 0) }} loaded · Deck
				{{ activeDeck }} targeted
			</span>
		</div>
	</div>
</template>
