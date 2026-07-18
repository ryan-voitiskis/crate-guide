<script setup lang="ts">
import { Disc3, ExternalLink, Music2 } from 'lucide-vue-next'
import type { DemoRecord, DemoTrack } from '~/demo/fixtures'

interface Props {
	record: DemoRecord
	tracks: DemoTrack[]
}

defineProps<Props>()
</script>

<template>
	<div class="p-4">
		<div class="grid grid-cols-[112px_minmax(0,1fr)] gap-4 lg:grid-cols-1">
			<img
				:src="record.cover"
				:alt="`${record.title} cover`"
				class="aspect-square w-full max-w-64 rounded-sm border object-cover shadow-md"
			/>
			<div class="min-w-0 lg:mt-4">
				<p
					class="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase"
				>
					{{ record.catno }} · {{ record.year }}
				</p>
				<h2 class="mt-1 text-lg leading-tight font-semibold">
					{{ record.title }}
				</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					{{ record.artists.join(', ') }}
				</p>
				<div class="mt-3 flex flex-wrap gap-1.5">
					<Badge variant="secondary">{{ record.label }}</Badge>
					<Badge variant="outline">{{ record.format }}</Badge>
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
					{{ tracks.length }}
				</span>
			</div>
			<div class="divide-y border-y">
				<div
					v-for="track in tracks"
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

		<div class="bg-primary/5 border-primary/15 mt-5 rounded-sm border p-3">
			<div class="flex items-start gap-2">
				<Disc3 class="text-primary mt-0.5 size-4 shrink-0" />
				<div>
					<p class="text-xs font-semibold">Your collection, your data</p>
					<p class="text-muted-foreground mt-1 text-[11px] leading-relaxed">
						Sign in to import Discogs releases or add your own records manually.
					</p>
				</div>
			</div>
			<Button as-child size="sm" class="mt-3 w-full">
				<NuxtLink to="/signup?redirect=%2Frecords">
					Build your library
					<ExternalLink class="ml-2 size-3.5" />
				</NuxtLink>
			</Button>
		</div>
	</div>
</template>
