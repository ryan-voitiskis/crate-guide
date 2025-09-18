<script setup lang="ts">
import { Filter, X } from 'lucide-vue-next'

const tracks = useTracksStore()
const trackFilters = useTrackFiltersStore()

const isOpen = ref(false)

const localBpmMin = ref('')
const localBpmMax = ref('')

const availableGenres = computed(() => {
	const genreSet = new Set<string>()
	tracks.tracks.forEach((track) => {
		track.genres.forEach((genre) => genreSet.add(genre.toLowerCase()))
	})
	return Array.from(genreSet).sort()
})

const keyOptions = computed(() => {
	const options = []
	for (let mode = 0; mode <= 1; mode++) {
		for (let key = 0; key < 12; key++) {
			options.push({
				value: key,
				label: getKeyString(key, mode),
				color: getKeyColour(key, mode)
			})
		}
	}
	return options
})

const activeFiltersCount = computed(() => {
	let count = 0
	if (trackFilters.showOnlyPlayable) count++
	if (trackFilters.bpmMin !== null || trackFilters.bpmMax !== null) count++
	if (trackFilters.selectedKey !== null) count++
	if (trackFilters.selectedGenres.length > 0) count++
	return count
})

watch(
	() => isOpen.value,
	(open) => {
		if (open) {
			localBpmMin.value = trackFilters.bpmMin?.toString() || ''
			localBpmMax.value = trackFilters.bpmMax?.toString() || ''
		}
	}
)

function applyBpmFilter() {
	const min = localBpmMin.value ? parseFloat(localBpmMin.value) : null
	const max = localBpmMax.value ? parseFloat(localBpmMax.value) : null
	trackFilters.setBpmRange(
		min !== null && !isNaN(min) ? min : null,
		max !== null && !isNaN(max) ? max : null
	)
}

function clearBpmFilter() {
	localBpmMin.value = ''
	localBpmMax.value = ''
	trackFilters.setBpmRange(null, null)
}

function toggleGenre(genre: string) {
	trackFilters.toggleGenre(genre)
}

function isGenreSelected(genre: string) {
	return trackFilters.selectedGenres.includes(genre)
}
</script>

<template>
	<Popover v-model:open="isOpen">
		<PopoverTrigger as-child>
			<Button variant="outline" class="relative">
				<Filter class="mr-2 size-4" />
				Filters
				<span
					v-if="activeFiltersCount > 0"
					class="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs"
				>
					{{ activeFiltersCount }}
				</span>
			</Button>
		</PopoverTrigger>
		<PopoverContent class="w-80">
			<div class="flex items-center justify-between mb-4">
				<h4 class="font-medium">Track Filters</h4>
				<Button
					v-if="trackFilters.hasActiveFilters"
					@click="trackFilters.resetAllFilters"
					variant="ghost"
					size="sm"
				>
					Clear all
				</Button>
			</div>

			<div class="space-y-4">
				<!-- Playable filter -->
				<div class="flex items-center space-x-2">
					<Switch
						id="playable"
						v-model:checked="trackFilters.showOnlyPlayable"
					/>
					<Label for="playable" class="text-sm font-normal">
						Show only playable tracks
					</Label>
				</div>

				<!-- BPM Range -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label class="text-sm">BPM Range</Label>
						<Button
							v-if="trackFilters.bpmMin !== null || trackFilters.bpmMax !== null"
							@click="clearBpmFilter"
							variant="ghost"
							size="sm"
							class="h-auto p-0 text-xs"
						>
							Clear
						</Button>
					</div>
					<div class="flex items-center gap-2">
						<Input
							v-model="localBpmMin"
							type="number"
							placeholder="Min"
							class="w-20"
							min="30"
							max="300"
							@blur="applyBpmFilter"
							@keydown.enter="applyBpmFilter"
						/>
						<span class="text-muted-foreground">to</span>
						<Input
							v-model="localBpmMax"
							type="number"
							placeholder="Max"
							class="w-20"
							min="30"
							max="300"
							@blur="applyBpmFilter"
							@keydown.enter="applyBpmFilter"
						/>
					</div>
				</div>

				<!-- Key filter -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label class="text-sm">Key</Label>
						<Button
							v-if="trackFilters.selectedKey !== null"
							@click="trackFilters.setSelectedKey(null)"
							variant="ghost"
							size="sm"
							class="h-auto p-0 text-xs"
						>
							Clear
						</Button>
					</div>
					<Select
						:model-value="trackFilters.selectedKey?.toString() || ''"
						@update:model-value="
							(v) => trackFilters.setSelectedKey(v ? Number(v) : null)
						"
					>
						<SelectTrigger class="w-full">
							<SelectValue placeholder="All keys">
								<template v-if="trackFilters.selectedKey !== null">
									<span
										class="inline-flex items-center gap-2"
										v-for="option in keyOptions"
										:key="`display-${option.value}`"
										v-show="option.value === trackFilters.selectedKey"
									>
										<span
											class="h-3 w-3 rounded-full"
											:style="{ backgroundColor: option.color }"
										/>
										{{ option.label }}
									</span>
								</template>
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="">All keys</SelectItem>
							<SelectItem
								v-for="option in keyOptions"
								:key="option.value"
								:value="option.value.toString()"
							>
								<span class="flex items-center gap-2">
									<span
										class="h-3 w-3 rounded-full"
										:style="{ backgroundColor: option.color }"
									/>
									{{ option.label }}
								</span>
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<!-- Genre filter -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label class="text-sm">
							Genres
							<span
								v-if="trackFilters.selectedGenres.length > 0"
								class="text-muted-foreground ml-1"
							>
								({{ trackFilters.selectedGenres.length }})
							</span>
						</Label>
						<Button
							v-if="trackFilters.selectedGenres.length > 0"
							@click="trackFilters.clearGenres"
							variant="ghost"
							size="sm"
							class="h-auto p-0 text-xs"
						>
							Clear
						</Button>
					</div>
					<ScrollArea class="h-40 rounded-md border">
						<div class="p-2 space-y-1">
							<label
								v-for="genre in availableGenres"
								:key="genre"
								class="flex items-center space-x-2 rounded px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
							>
								<Checkbox
									:checked="isGenreSelected(genre)"
									@update:checked="toggleGenre(genre)"
								/>
								<span class="flex-1 capitalize">{{ genre }}</span>
							</label>
							<div
								v-if="!availableGenres.length"
								class="text-muted-foreground text-center py-4 text-sm"
							>
								No genres found
							</div>
						</div>
					</ScrollArea>
				</div>
			</div>
		</PopoverContent>
	</Popover>
</template>
