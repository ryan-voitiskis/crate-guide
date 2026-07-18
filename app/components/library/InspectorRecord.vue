<script setup lang="ts">
import {
	CalendarDays,
	Disc3,
	ExternalLink,
	FolderPlus,
	Hash,
	ImagePlus,
	ListMusic,
	Pencil,
	Tag,
	Trash2,
	X
} from 'lucide-vue-next'

const props = defineProps<{
	record: DatabaseRecord
	trackCount: number
	showClose?: boolean
}>()

const emit = defineEmits<{
	close: []
}>()

const recordDetails = useRecordDetailsStore()

const artistNames = computed(() =>
	props.record.artists.map((artist) => artist.name).join(', ')
)

function editRecord() {
	recordDetails.openRecord(props.record.id, true)
}

function openAddToCrate() {
	recordDetails.recordToAddToCrate = props.record
}

function openDiscogs() {
	if (props.record.discogs_release_url)
		openInNewTab(props.record.discogs_release_url)
}

function removeRecord() {
	recordDetails.recordToRemove = props.record
}

function addCover() {
	recordDetails.openRecord(props.record.id, true, 'cover')
}
</script>

<template>
	<div class="flex h-full min-h-0 flex-col">
		<div
			class="border-border flex h-10 shrink-0 items-center justify-between border-b px-3"
		>
			<div class="flex items-center gap-2">
				<span class="bg-primary size-1.5 rounded-full" />
				<span
					class="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase"
				>
					Record inspector
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
			<ImageRecordCover
				:record="record"
				show-label
				class="relative mb-4 aspect-square rounded-md border"
			>
				<template #missing>
					<div class="flex flex-col items-center gap-3 text-center">
						<ImagePlus class="text-muted-foreground size-10 stroke-[1.25]" />
						<div>
							<p class="text-sm font-medium">No cover artwork</p>
							<p class="text-muted-foreground mt-1 text-xs">
								Add your own image when Discogs does not have one.
							</p>
						</div>
						<Button size="sm" variant="outline" @click="addCover">
							<ImagePlus class="mr-1.5 size-3.5" />
							Add cover
						</Button>
					</div>
				</template>
				<template #error>
					<div class="flex flex-col items-center gap-3 text-center">
						<Disc3 class="text-muted-foreground size-10 stroke-[1.25]" />
						<p class="text-sm font-medium">Cover unavailable</p>
						<Button size="sm" variant="outline" @click="addCover">
							Replace cover
						</Button>
					</div>
				</template>
				<div
					class="pointer-events-none absolute inset-2 border border-white/20"
				/>
			</ImageRecordCover>

			<p
				class="text-muted-foreground font-mono text-[10px] tracking-wider uppercase"
			>
				{{ record.labels[0]?.catno || 'Uncatalogued' }}
			</p>
			<h2 class="mt-1 text-lg leading-tight font-semibold">
				{{ record.title }}
			</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{{ artistNames || 'Unknown artist' }}
			</p>

			<div class="border-border mt-4 grid grid-cols-2 border-y py-1">
				<div class="border-border border-r px-2 py-2">
					<p class="text-muted-foreground font-mono text-[9px] uppercase">
						Tracks
					</p>
					<p class="mt-1 font-mono text-sm tabular-nums">{{ trackCount }}</p>
				</div>
				<div class="px-2 py-2">
					<p class="text-muted-foreground font-mono text-[9px] uppercase">
						Year
					</p>
					<p class="mt-1 font-mono text-sm tabular-nums">
						{{ record.year || '—' }}
					</p>
				</div>
			</div>

			<dl class="mt-4 space-y-3 text-sm">
				<div class="flex gap-3">
					<Tag class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
					<div class="min-w-0">
						<dt class="text-muted-foreground text-[10px] uppercase">Label</dt>
						<dd class="truncate">
							{{ record.labels[0]?.name || 'Unknown label' }}
						</dd>
					</div>
				</div>
				<div class="flex gap-3">
					<Hash class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
					<div>
						<dt class="text-muted-foreground text-[10px] uppercase">
							Catalogue
						</dt>
						<dd class="font-mono text-xs">
							{{ record.labels[0]?.catno || '—' }}
						</dd>
					</div>
				</div>
				<div class="flex gap-3">
					<CalendarDays
						class="text-muted-foreground mt-0.5 size-3.5 shrink-0"
					/>
					<div>
						<dt class="text-muted-foreground text-[10px] uppercase">
							Released
						</dt>
						<dd>{{ record.year || 'Unknown' }}</dd>
					</div>
				</div>
				<div class="flex gap-3">
					<ListMusic class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
					<div>
						<dt class="text-muted-foreground text-[10px] uppercase">
							Track listing
						</dt>
						<dd>
							{{ trackCount }} {{ trackCount === 1 ? 'track' : 'tracks' }}
						</dd>
					</div>
				</div>
			</dl>
		</div>

		<div class="border-border grid shrink-0 grid-cols-2 gap-2 border-t p-3">
			<Button size="sm" @click="editRecord">
				<Pencil class="mr-1.5 size-3.5" />
				Edit
			</Button>
			<Button size="sm" variant="outline" @click="openAddToCrate">
				<FolderPlus class="mr-1.5 size-3.5" />
				Crates
			</Button>
			<Button
				v-if="record.discogs_release_url"
				size="sm"
				variant="outline"
				@click="openDiscogs"
			>
				<ExternalLink class="mr-1.5 size-3.5" />
				Discogs
			</Button>
			<Button
				size="sm"
				variant="destructive-ghost"
				class="text-destructive"
				@click="removeRecord"
			>
				<Trash2 class="mr-1.5 size-3.5" />
				Remove
			</Button>
		</div>
	</div>
</template>
