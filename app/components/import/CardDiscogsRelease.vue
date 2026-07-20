<script setup lang="ts">
import { CircleCheck, ImageOff } from 'lucide-vue-next'

const props = defineProps<{
	release: DiscogsReleaseToFilter | DiscogsRelease
	showCheckbox?: boolean
}>()

const emit = defineEmits<{
	'update:selected': [value: boolean]
}>()

const isFilterableRelease = (
	release: DiscogsReleaseToFilter | DiscogsRelease
): release is DiscogsReleaseToFilter => {
	return 'selected' in release
}

const isSelected = computed({
	get: () => isFilterableRelease(props.release) && props.release.selected,
	set: (value: boolean) => emit('update:selected', value)
})

const checkboxId = computed(() => `discogs-release-${props.release.id}-select`)
const artistNames = computed(() =>
	props.release.basic_information.artists
		.map((artist) => artist.name)
		.join(', ')
)
const selectionLabel = computed(
	() =>
		`Select ${props.release.basic_information.title} by ${artistNames.value || 'Unknown artist'} for import`
)
const alreadyImported = computed(
	() =>
		isFilterableRelease(props.release) && Boolean(props.release.alreadyImported)
)
const isSelectableCard = computed(
	() =>
		props.showCheckbox &&
		isFilterableRelease(props.release) &&
		!alreadyImported.value
)
</script>

<template>
	<component
		:is="isSelectableCard ? 'label' : 'div'"
		:for="isSelectableCard ? checkboxId : undefined"
		class="bg-card text-card-foreground border-border grid min-h-16 w-full overflow-hidden rounded-sm border shadow-xs"
		:class="[
			showCheckbox && isFilterableRelease(release)
				? 'grid-cols-[64px_minmax(0,1fr)_88px]'
				: 'grid-cols-[64px_minmax(0,1fr)]',
			isSelectableCard &&
				'hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-colors',
			alreadyImported && 'bg-muted/20'
		]"
	>
		<div
			class="bg-muted border-border flex size-16 items-center justify-center overflow-hidden border-r"
		>
			<img
				v-if="release.basic_information.cover_image"
				:src="release.basic_information.cover_image"
				:alt="`${release.basic_information.title} cover`"
				class="size-full object-cover"
			/>
			<ImageOff v-else class="text-muted-foreground size-5" />
		</div>
		<div class="flex min-w-0 flex-col justify-center px-2.5 py-1.5">
			<h3
				class="truncate text-xs font-semibold"
				:title="release.basic_information.title"
			>
				{{ release.basic_information.title }}
			</h3>
			<p class="text-muted-foreground truncate text-[11px]">
				{{ artistNames }}
			</p>
			<p
				class="text-muted-foreground mt-1 flex min-w-0 items-center gap-2 font-mono text-[9px] tracking-wide uppercase"
			>
				<span
					v-if="release.basic_information.labels[0]?.catno"
					class="text-foreground truncate font-semibold"
				>
					{{ release.basic_information.labels[0]?.catno }}
				</span>
				<span class="truncate">
					{{ release.basic_information.labels[0]?.name }}
				</span>
				<span
					v-if="release.basic_information.year"
					class="ml-auto shrink-0 tabular-nums"
				>
					{{ release.basic_information.year }}
				</span>
			</p>
		</div>
		<div
			v-if="showCheckbox && isFilterableRelease(release)"
			class="border-border flex items-center justify-center gap-1.5 border-l px-2"
		>
			<template v-if="alreadyImported">
				<CircleCheck class="text-led size-3.5 shrink-0" />
				<span
					class="text-muted-foreground font-mono text-[8px] tracking-wide uppercase"
				>
					In library
				</span>
			</template>
			<Checkbox
				v-else
				:id="checkboxId"
				v-model="isSelected"
				:aria-label="selectionLabel"
			/>
		</div>
	</component>
</template>
