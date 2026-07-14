<script setup lang="ts">
import { ImageOff } from 'lucide-vue-next'

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
</script>

<template>
	<div
		class="bg-card text-card-foreground border-border grid min-h-16 w-full overflow-hidden rounded-sm border shadow-xs"
		:class="
			showCheckbox && isFilterableRelease(release)
				? 'grid-cols-[64px_minmax(0,1fr)_36px]'
				: 'grid-cols-[64px_minmax(0,1fr)]'
		"
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
				{{
					release.basic_information.artists
						.map((artist) => artist.name)
						.join(', ')
				}}
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
			class="border-border flex items-center justify-center border-l"
		>
			<Checkbox v-model:checked="isSelected" />
		</div>
	</div>
</template>
