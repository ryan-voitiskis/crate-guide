<script setup lang="ts">
import {
	Clock3,
	Disc3,
	Gauge,
	Hash,
	KeyRound,
	ListMusic,
	Pencil,
	RotateCcw,
	Tag,
	X
} from 'lucide-vue-next'

const props = defineProps<{
	track: Track
	record: DatabaseRecord | null
	showClose?: boolean
}>()

const emit = defineEmits<{
	close: []
	edit: []
}>()

const user = useUserStore()

const artists = computed(() =>
	[...props.track.artists, ...props.track.extraartists]
		.map((artist) => artist.name)
		.join(', ')
)

const formattedKey = computed(() => {
	if (props.track.key === null || props.track.mode === null) return '—'
	return getFormattedKeyString(
		props.track.key,
		props.track.mode,
		user.currentKeyFormat,
		'short'
	)
})

const keyColour = computed(() => {
	if (props.track.key === null || props.track.mode === null) return undefined
	return getKeyColour(props.track.key, props.track.mode)
})
</script>

<template>
	<div class="flex h-full min-h-0 flex-col">
		<div
			class="border-border flex h-10 shrink-0 items-center justify-between border-b px-3"
		>
			<div class="flex items-center gap-2">
				<span
					class="size-1.5 rounded-full"
					:class="track.playable ? 'bg-emerald-500' : 'bg-destructive'"
				/>
				<span
					class="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase"
				>
					Track inspector
				</span>
			</div>
			<Button
				v-if="showClose"
				variant="ghost"
				size="icon"
				class="size-7"
				aria-label="Close inspector"
				@click="emit('close')"
			>
				<X class="size-3.5" />
			</Button>
		</div>

		<div class="scrollbar-hidden min-h-0 flex-1 overflow-y-auto p-3">
			<div class="flex gap-3">
				<div class="bg-muted relative size-20 shrink-0 rounded-md border">
					<ImageRecordCover
						v-if="record"
						:record="record"
						class="size-full rounded-md"
					/>
					<Disc3
						v-if="!record"
						class="text-muted-foreground absolute inset-0 m-auto size-8 stroke-[1.25]"
					/>
				</div>
				<div class="min-w-0 py-1">
					<p
						class="text-muted-foreground font-mono text-[10px] tracking-wider uppercase"
					>
						{{ track.position || 'No position' }}
					</p>
					<h2 class="mt-1 text-base leading-tight font-semibold">
						{{ track.title }}
					</h2>
					<p class="text-muted-foreground mt-1 line-clamp-2 text-xs">
						{{ artists || 'Unknown artist' }}
					</p>
				</div>
			</div>

			<div
				class="border-border mt-4 grid grid-cols-3 border-y py-1 text-center"
			>
				<div class="border-border border-r px-1 py-2">
					<p class="text-muted-foreground font-mono text-[9px] uppercase">
						BPM
					</p>
					<p class="mt-1 font-mono text-sm font-semibold tabular-nums">
						{{ track.bpm ? track.bpm.toFixed(1) : '—' }}
					</p>
				</div>
				<div class="border-border border-r px-1 py-2">
					<p class="text-muted-foreground font-mono text-[9px] uppercase">
						Key
					</p>
					<p
						class="mt-1 font-mono text-sm font-semibold"
						:style="{ color: keyColour }"
					>
						{{ formattedKey }}
					</p>
				</div>
				<div class="px-1 py-2">
					<p class="text-muted-foreground font-mono text-[9px] uppercase">
						Time
					</p>
					<p class="mt-1 font-mono text-sm font-semibold tabular-nums">
						{{ msToMMSS(track.duration) || '—' }}
					</p>
				</div>
			</div>

			<dl class="mt-4 space-y-3 text-sm">
				<div class="flex gap-3">
					<ListMusic class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
					<div class="min-w-0">
						<dt class="text-muted-foreground text-[10px] uppercase">Release</dt>
						<dd class="truncate">{{ record?.title || 'Unknown release' }}</dd>
					</div>
				</div>
				<div class="flex gap-3">
					<Hash class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
					<div>
						<dt class="text-muted-foreground text-[10px] uppercase">
							Catalogue
						</dt>
						<dd class="font-mono text-xs">
							{{ record?.labels?.[0]?.catno || '—' }}
						</dd>
					</div>
				</div>
				<div class="flex gap-3">
					<Tag class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
					<div class="min-w-0">
						<dt class="text-muted-foreground text-[10px] uppercase">Genre</dt>
						<dd>{{ track.genres.join(' · ') || 'Unclassified' }}</dd>
					</div>
				</div>
				<div class="flex gap-3">
					<RotateCcw class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
					<div>
						<dt class="text-muted-foreground text-[10px] uppercase">Speed</dt>
						<dd>{{ track.rpm ? `${track.rpm} RPM` : 'Unknown' }}</dd>
					</div>
				</div>
				<div class="flex gap-3">
					<Clock3 class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
					<div>
						<dt class="text-muted-foreground text-[10px] uppercase">
							Time signature
						</dt>
						<dd>
							{{
								track.time_signature_upper && track.time_signature_lower
									? `${track.time_signature_upper}/${track.time_signature_lower}`
									: 'Unknown'
							}}
						</dd>
					</div>
				</div>
			</dl>

			<div class="mt-4 flex flex-wrap gap-1.5">
				<Badge variant="outline" class="gap-1 font-mono text-[10px]">
					<Gauge class="size-3" />
					{{ track.bpm ? 'TEMPO SET' : 'NO TEMPO' }}
				</Badge>
				<Badge variant="outline" class="gap-1 font-mono text-[10px]">
					<KeyRound class="size-3" />
					{{ track.key === null ? 'NO KEY' : 'KEY SET' }}
				</Badge>
			</div>
		</div>

		<div class="border-border shrink-0 border-t p-3">
			<Button size="sm" class="w-full" @click="emit('edit')">
				<Pencil class="mr-1.5 size-3.5" />
				Edit track
			</Button>
		</div>
	</div>
</template>
