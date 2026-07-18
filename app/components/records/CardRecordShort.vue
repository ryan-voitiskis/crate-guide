<script setup lang="ts">
import {
	Disc3,
	Eye,
	FolderPlus,
	MoreHorizontal,
	Pencil,
	Trash2
} from 'lucide-vue-next'

const recordDetails = useRecordDetailsStore()
const props = defineProps<{
	record: DatabaseRecord
	selected?: boolean
}>()

const emit = defineEmits<{
	select: []
}>()

const artistNames = computed(() =>
	props.record.artists.map((artist) => artist.name).join(', ')
)

function viewRecord() {
	recordDetails.openRecord(props.record.id)
}

function editRecord() {
	recordDetails.openRecord(props.record.id, true)
}

function openAddToCrate() {
	recordDetails.recordToAddToCrate = props.record
}

function openInDiscogs() {
	if (props.record.discogs_release_url)
		openInNewTab(props.record.discogs_release_url)
}

function confirmRemove() {
	recordDetails.recordToRemove = props.record
}
</script>

<template>
	<div
		role="button"
		tabindex="0"
		class="group focus-visible:ring-ring min-w-0 cursor-pointer rounded-md focus-visible:ring-2 focus-visible:outline-none"
		:class="
			selected && 'ring-primary ring-offset-background ring-2 ring-offset-2'
		"
		@click="emit('select')"
		@dblclick="viewRecord"
		@keydown.enter="emit('select')"
	>
		<div
			class="bg-muted relative aspect-square overflow-hidden rounded-md border shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md"
		>
			<ImageRecordCover :record="record" class="absolute inset-0">
				<template #missing>
					<Disc3 class="text-muted-foreground size-12 stroke-[1.25]" />
				</template>
			</ImageRecordCover>
			<div
				class="absolute inset-x-0 bottom-0 flex items-end justify-between bg-linear-to-t from-black/75 to-transparent px-2 pt-8 pb-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
			>
				<span class="font-mono text-[9px] text-white/75 uppercase">
					{{ record.labels[0]?.catno || 'NO CAT' }}
				</span>
				<DropdownMenu>
					<DropdownMenuTrigger as-child>
						<Button
							variant="secondary"
							size="icon"
							class="size-7 bg-black/55 text-white hover:bg-black/75"
							aria-label="Record actions"
							@click.stop
						>
							<MoreHorizontal class="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem @click="viewRecord">
							<Eye class="mr-2 size-4" />
							View full details
						</DropdownMenuItem>
						<DropdownMenuItem @click="editRecord">
							<Pencil class="mr-2 size-4" />
							Edit record
						</DropdownMenuItem>
						<DropdownMenuItem @click="openAddToCrate">
							<FolderPlus class="mr-2 size-4" />
							Manage crates
						</DropdownMenuItem>
						<DropdownMenuItem
							v-if="record.discogs_release_url"
							@click="openInDiscogs"
						>
							<IconDiscogs class="mr-2 size-4" />
							Open in Discogs
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							class="text-destructive focus:text-destructive"
							@click="confirmRemove"
						>
							<Trash2 class="mr-2 size-4" />
							Remove from collection
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>

		<div class="px-0.5 pt-2">
			<h3 class="truncate text-sm leading-tight font-semibold">
				{{ record.title }}
			</h3>
			<p class="text-muted-foreground mt-0.5 truncate text-xs">
				{{ artistNames || 'Unknown artist' }}
			</p>
			<p
				class="text-muted-foreground/75 mt-1 truncate font-mono text-[9px] uppercase"
			>
				{{ record.labels[0]?.name || 'Unknown label' }}
				<span v-if="record.year">· {{ record.year }}</span>
			</p>
		</div>
	</div>
</template>
