<script setup lang="ts">
import {
	CheckCircle2,
	CircleSlash2,
	Disc3,
	ExternalLink,
	Gauge,
	KeyRound
} from 'lucide-vue-next'
import {
	type DemoRecord,
	type DemoTrack,
	formatDemoDuration
} from '~/demo/fixtures'

interface Props {
	track: DemoTrack
	record: DemoRecord
}

defineProps<Props>()
</script>

<template>
	<div class="p-4">
		<div class="flex gap-3">
			<img
				:src="record.cover"
				:alt="`${record.title} cover`"
				class="size-24 rounded-sm border object-cover shadow-sm"
			/>
			<div class="min-w-0">
				<p
					class="text-muted-foreground font-mono text-[10px] tracking-[0.1em] uppercase"
				>
					{{ record.catno }} · {{ track.position }}
				</p>
				<h2 class="mt-1 text-base leading-tight font-semibold">
					{{ track.title }}
				</h2>
				<p class="text-muted-foreground mt-1 text-xs">
					{{ track.artists.join(', ') }}
				</p>
				<div class="mt-2 flex flex-wrap gap-1">
					<Badge v-for="genre in track.genres" :key="genre" variant="secondary">
						{{ genre }}
					</Badge>
				</div>
			</div>
		</div>

		<div class="mt-5 grid grid-cols-3 border-y">
			<div class="border-r py-3 text-center">
				<Gauge class="text-muted-foreground mx-auto size-3.5" />
				<p class="mt-1 font-mono text-lg font-semibold tabular-nums">
					{{ track.bpm.toFixed(1) }}
				</p>
				<p class="text-muted-foreground text-[9px] tracking-[0.08em] uppercase">
					BPM
				</p>
			</div>
			<div class="border-r py-3 text-center">
				<KeyRound class="mx-auto size-3.5" :style="{ color: track.keyColor }" />
				<p
					class="mt-1 font-mono text-lg font-semibold"
					:style="{ color: track.keyColor }"
				>
					{{ track.key }}
				</p>
				<p class="text-muted-foreground text-[9px] tracking-[0.08em] uppercase">
					Key
				</p>
			</div>
			<div class="py-3 text-center">
				<CheckCircle2
					v-if="track.playable"
					class="mx-auto size-3.5 text-emerald-500"
				/>
				<CircleSlash2 v-else class="text-muted-foreground mx-auto size-3.5" />
				<p class="mt-1 font-mono text-lg font-semibold">
					{{ formatDemoDuration(track.duration) }}
				</p>
				<p class="text-muted-foreground text-[9px] tracking-[0.08em] uppercase">
					Time
				</p>
			</div>
		</div>

		<dl
			class="mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs"
		>
			<dt class="text-muted-foreground">Release</dt>
			<dd class="truncate font-medium">{{ record.title }}</dd>
			<dt class="text-muted-foreground">Label</dt>
			<dd class="truncate">{{ record.label }}</dd>
			<dt class="text-muted-foreground">Catalog</dt>
			<dd class="font-mono text-[11px]">{{ record.catno }}</dd>
			<dt class="text-muted-foreground">Year</dt>
			<dd class="font-mono">{{ record.year }}</dd>
			<dt class="text-muted-foreground">Playable</dt>
			<dd>
				{{
					track.playable
						? 'Included in suggestions'
						: 'Excluded from suggestions'
				}}
			</dd>
		</dl>

		<div class="bg-primary/5 border-primary/15 mt-5 rounded-sm border p-3">
			<div class="flex items-start gap-2">
				<Disc3 class="text-primary mt-0.5 size-4 shrink-0" />
				<p class="text-muted-foreground text-[11px] leading-relaxed">
					Tracks inherit release context while keeping performance metadata—BPM,
					key, duration and playability—close at hand.
				</p>
			</div>
			<Button as-child size="sm" class="mt-3 w-full">
				<NuxtLink to="/signup?redirect=%2Ftracks">
					Try it with your records
					<ExternalLink class="ml-2 size-3.5" />
				</NuxtLink>
			</Button>
		</div>
	</div>
</template>
