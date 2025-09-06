<script setup lang="ts">
const props = defineProps<{
	record: DatabaseRecord
	showControls?: boolean
}>()

const emit = defineEmits<{
	select: [record: DatabaseRecord]
	edit: [record: DatabaseRecord]
	delete: [record: DatabaseRecord]
}>()

const coverImg = computed(() =>
	props.record.cover ? `url("${props.record.cover}")` : `none`
)

const artistNames = computed(() =>
	props.record.artists.map((artist) => artist.name).join(', ')
)

const primaryLabel = computed(() => props.record.labels[0])

const hasMultipleArtists = computed(() => props.record.artists.length > 1)

function handleDiscogsClick() {
	if (typeof window !== 'undefined' && props.record.discogs_release_url)
		window.open(props.record.discogs_release_url, '_blank')
}
</script>

<template>
	<Card
		class="group relative overflow-hidden p-0 transition-all hover:shadow-md"
	>
		<CardContent class="p-0">
			<div class="grid w-full grid-cols-[90px_1fr_90px] gap-4">
				<div
					class="bg-muted aspect-square h-[90px] w-[90px] overflow-hidden rounded-md bg-cover bg-center bg-no-repeat"
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
							v-if="primaryLabel?.catno"
							class="text-foreground font-semibold"
						>
							{{ primaryLabel.catno }}
						</span>
						<span v-if="primaryLabel?.name" class="truncate">
							{{ primaryLabel.name }}
						</span>
						<span v-if="record.year" class="text-muted-foreground/70">
							{{ record.year }}
						</span>
					</div>

					<div class="text-muted-foreground mt-1 flex items-center text-sm">
						<span class="flex-1 truncate" :title="artistNames">
							{{ artistNames }}
						</span>
						<span
							v-if="hasMultipleArtists"
							class="bg-secondary text-secondary-foreground ml-2 rounded px-1.5 py-0.5 text-xs"
						>
							+{{ record.artists.length - 1 }}
						</span>
					</div>
				</div>

				<div class="flex justify-end py-1">
					<Button
						v-if="record.discogs_release_url"
						@click="handleDiscogsClick"
						variant="link"
					>
						View on Discogs
					</Button>
				</div>
			</div>
		</CardContent>
	</Card>
</template>
