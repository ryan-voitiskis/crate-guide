<script setup lang="ts">
const props = defineProps<{
	release: DiscogsReleaseToFilter | DiscogsRelease
	showCheckbox?: boolean
}>()

const emit = defineEmits<{
	'update:selected': [value: boolean]
}>()

const coverImg = computed(
	() => `url("${props.release.basic_information.cover_image}")`
)

const isFilterableRelease = (
	release: DiscogsReleaseToFilter | DiscogsRelease
): release is DiscogsReleaseToFilter => {
	return 'selected' in release
}

const isSelected = computed({
	get: () => isFilterableRelease(props.release) && props.release.selected,
	set: (value: boolean) => emit('update:selected', value)
})
</script>

<template>
	<div
		class="bg-card text-card-foreground border-border grid w-full grid-cols-[90px_1fr_40px] grid-rows-[40px_20px_30px] overflow-hidden rounded-lg border"
	>
		<div
			class="z-0 overflow-hidden bg-contain bg-no-repeat [grid-area:1/1/5/2]"
			:style="{ backgroundImage: coverImg }"
		/>
		<h3
			class="text-card-foreground ml-2.5 truncate leading-[40px] [grid-area:1/2/2/3]"
		>
			{{ release.basic_information.title }}
		</h3>
		<div
			class="text-muted-foreground ml-2.5 truncate text-xs leading-5 [grid-area:2/2/3/3]"
		>
			<span class="font-semibold">
				{{ release.basic_information.labels[0]?.catno }}
			</span>
			{{ release.basic_information.labels[0]?.name }}
			<span class="text-muted-foreground">
				{{ release.basic_information.year }}
			</span>
		</div>
		<span
			class="text-card-foreground ml-2.5 truncate leading-[30px] [grid-area:3/2/4/3]"
		>
			{{
				release.basic_information.artists
					.map((artist) => artist.name)
					.join(', ')
			}}
		</span>
		<div
			v-if="showCheckbox && isFilterableRelease(release)"
			class="flex items-center justify-center [grid-area:1/3/4/4]"
		>
			<Checkbox v-model:checked="isSelected" />
		</div>
	</div>
</template>
