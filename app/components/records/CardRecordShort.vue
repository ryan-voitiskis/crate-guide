<script setup lang="ts">
import { Eye, FolderPlus, MoreVertical, Pencil, Trash2 } from 'lucide-vue-next'

const recordDetails = useRecordDetailsStore()
const props = defineProps<{ record: DatabaseRecord }>()

const coverImg = computed(() =>
	props.record.cover ? `url("${props.record.cover}")` : `none`
)

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
	if (props.record.discogs_release_url) {
		openInNewTab(props.record.discogs_release_url)
	}
}

function confirmRemove() {
	recordDetails.recordToRemove = props.record
}
</script>

<template>
	<Card
		class="group relative overflow-hidden p-0 transition-all hover:shadow-md"
		@click="viewRecord"
	>
		<CardContent class="p-0">
			<div class="grid w-full grid-cols-[90px_1fr_90px] gap-4">
				<!-- TODO: fallback -->
				<div
					class="bg-muted aspect-square h-[90px] w-[90px] overflow-hidden bg-cover bg-center bg-no-repeat"
					:style="{ backgroundImage: coverImg }"
				/>

				<div class="flex min-w-0 flex-col justify-between py-1">
					<h3
						class="text-foreground truncate text-sm leading-tight font-medium"
					>
						{{ record.title }}
					</h3>

					<div
						class="text-muted-foreground mt-1 flex items-center gap-1 truncate text-xs"
					>
						<span
							v-if="record.labels[0]?.catno"
							class="text-foreground font-semibold"
						>
							{{ record.labels[0].catno }}
						</span>
						<span v-if="record.labels[0]?.name" class="truncate">
							{{ record.labels[0].name }}
						</span>
						<span v-if="record.year" class="text-muted-foreground/70">
							{{ record.year }}
						</span>
					</div>

					<div
						class="text-muted-foreground mt-1 flex items-center truncate text-sm"
					>
						{{ artistNames }}
					</div>
				</div>

				<div class="flex items-center justify-end">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" @click.stop>
								<MoreVertical class="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem @click="viewRecord">
								<Eye class="mr-2 size-4" />
								View record
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
								@click="confirmRemove"
								class="text-destructive focus:text-destructive"
							>
								<Trash2 class="mr-2 size-4" />
								Remove from collection
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</CardContent>
	</Card>
</template>
