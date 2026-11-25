<script setup lang="ts">
import { ArrowDownToLine, ArrowUpFromLine } from '@lucide/vue'
import type { TransitionDirection } from '~/utils/transitionHistory'

const props = defineProps<{
	trackId: string
}>()

const TRANSITIONS_PER_DIRECTION = 3
const headingId = useId()

const tracks = useWorkbenchTracksStore()
const transitionHistory = useTransitionHistory()
useSavedSetsOnMount()

type TransitionRow = {
	trackId: string
	title: string
	artists: string
	plays: number
	rating: string | null
	label: string
}

function rowsFor(direction: TransitionDirection): TransitionRow[] {
	const relation =
		direction === 'incoming' ? 'Played before this' : 'Played after this'
	return rankTrackTransitions(
		transitionHistory.value,
		props.trackId,
		direction,
		{
			limit: TRANSITIONS_PER_DIRECTION,
			include: (trackId) => tracks.getTrackById(trackId) !== undefined
		}
	).flatMap(({ trackId, stats }) => {
		const track = tracks.getTrackById(trackId)
		if (!track) return []
		return [
			{
				trackId,
				title: track.title,
				artists:
					track.artists.map((artist) => artist.name).join(', ') ||
					'Unknown artist',
				plays: stats.plays,
				rating:
					stats.averageRating === null
						? null
						: formatAverageRating(stats.averageRating),
				label: describeTransitionHistory(stats, relation)
			}
		]
	})
}

const sections = computed(() =>
	[
		{
			direction: 'incoming' as const,
			heading: 'Into this track',
			icon: ArrowDownToLine,
			rows: rowsFor('incoming')
		},
		{
			direction: 'outgoing' as const,
			heading: 'Out of this track',
			icon: ArrowUpFromLine,
			rows: rowsFor('outgoing')
		}
	].filter((section) => section.rows.length > 0)
)
</script>

<template>
	<section
		v-if="sections.length > 0"
		:aria-labelledby="headingId"
		data-testid="track-transitions"
	>
		<h3
			:id="headingId"
			class="text-muted-foreground font-mono text-[10px] font-semibold tracking-[0.14em] uppercase"
		>
			Transition history
		</h3>
		<div
			v-for="section in sections"
			:key="section.direction"
			class="mt-3"
			:data-testid="`track-transitions-${section.direction}`"
		>
			<p
				class="text-muted-foreground flex items-center gap-1.5 text-[10px] uppercase"
			>
				<component :is="section.icon" class="size-3" aria-hidden="true" />
				{{ section.heading }}
			</p>
			<ol class="mt-1.5 space-y-1.5">
				<li
					v-for="row in section.rows"
					:key="row.trackId"
					class="flex items-start justify-between gap-2"
					:title="row.label"
				>
					<div class="min-w-0">
						<p class="truncate text-xs font-medium">{{ row.title }}</p>
						<p class="text-muted-foreground truncate text-[10px]">
							{{ row.artists }}
						</p>
					</div>
					<p
						class="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums"
						aria-hidden="true"
					>
						<span v-if="row.rating !== null" class="text-yellow-500">
							{{ row.rating }}★
						</span>
						<span v-else>unrated</span>
						· {{ row.plays }}×
					</p>
					<span class="sr-only">{{ row.label }}</span>
				</li>
			</ol>
		</div>
	</section>
</template>
