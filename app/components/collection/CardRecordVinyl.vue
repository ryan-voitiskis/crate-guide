<script setup lang="ts">
const records = useRecordsStore()
const recordDetails = useRecordDetailsStore()
const props = defineProps<{ record: DatabaseRecord }>()

const coverImg = computed(() =>
	props.record.cover ? `url("${props.record.cover}")` : `none`
)

const artistNames = computed(() =>
	props.record.artists.map((artist) => artist.name).join(', ')
)
</script>

<template>
	<Card
		class="group relative overflow-hidden p-0 transition-all hover:shadow-md"
		@click="recordDetails.openRecord(record.id)"
	>
		<CardContent class="p-0">
			<div class="grid w-full grid-cols-[90px_1fr_90px] gap-4">
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

				<div class="flex justify-end">
					<Button
						v-if="record.discogs_release_url"
						@click="openInNewTab(record.discogs_release_url)"
						variant="ghost"
						size="icon"
					>
						<IconDiscogs class="size-4" />
					</Button>
				</div>
			</div>
		</CardContent>
	</Card>
</template>
