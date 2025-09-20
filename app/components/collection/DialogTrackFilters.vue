<script setup lang="ts">
import { Filter } from 'lucide-vue-next'

const trackFilters = useTrackFiltersStore()

const isOpen = ref(false)

// TODO: refactor, will use more appropriate UI
function clearBpmFilter() {
	trackFilters.setBpmRange(null, null)
}

// TODO: refactor, will use more appropriate UI
function handleBpmMinInput(event: Event) {
	const value = (event.target as HTMLInputElement).value
	const min = value ? parseFloat(value) : null
	if (min !== null && !isNaN(min)) {
		trackFilters.setBpmRange(min, trackFilters.bpmMax)
	} else if (value === '') {
		trackFilters.setBpmRange(null, trackFilters.bpmMax)
	}
}

// TODO: refactor, will use more appropriate UI
function handleBpmMaxInput(event: Event) {
	const value = (event.target as HTMLInputElement).value
	const max = value ? parseFloat(value) : null
	if (max !== null && !isNaN(max)) {
		trackFilters.setBpmRange(trackFilters.bpmMin, max)
	} else if (value === '') {
		trackFilters.setBpmRange(trackFilters.bpmMin, null)
	}
}
</script>

<template>
	<Popover v-model:open="isOpen">
		<PopoverTrigger as-child>
			<Button variant="outline" class="relative">
				<Filter class="mr-2 size-4" />
				Filters
				<span
					v-if="trackFilters.activeFiltersCount > 0"
					class="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs"
				>
					{{ trackFilters.activeFiltersCount }}
				</span>
			</Button>
		</PopoverTrigger>
		<PopoverContent class="w-80">
			<div class="mb-4 flex items-center justify-between">
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
					<Switch id="playable" v-model="trackFilters.showOnlyPlayable" />
					<Label for="playable" class="text-sm font-normal">
						Show only playable tracks
					</Label>
				</div>

				<!-- BPM Range -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label class="text-sm">BPM Range</Label>
						<Button
							v-if="
								trackFilters.bpmMin !== null || trackFilters.bpmMax !== null
							"
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
							:model-value="trackFilters.bpmMin?.toString() || ''"
							type="number"
							placeholder="Min"
							class="w-20"
							min="30"
							max="300"
							@input="handleBpmMinInput"
						/>
						<span class="text-muted-foreground">to</span>
						<Input
							:model-value="trackFilters.bpmMax?.toString() || ''"
							type="number"
							placeholder="Max"
							class="w-20"
							min="30"
							max="300"
							@input="handleBpmMaxInput"
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
							class="h-auto text-xs"
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
										v-for="option in trackFilters.keyOptions"
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
							<SelectItem
								v-for="option in trackFilters.keyOptions"
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
						<div class="space-y-1 p-2">
							<label
								v-for="genre in trackFilters.availableGenres"
								:key="genre"
								class="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center space-x-2 rounded px-2 py-1 text-sm"
							>
								<Checkbox
									:checked="trackFilters.selectedGenres.includes(genre)"
									@click="trackFilters.toggleGenre(genre)"
								/>
								<span class="flex-1 capitalize">{{ genre }}</span>
							</label>
							<div
								v-if="!trackFilters.availableGenres.length"
								class="text-muted-foreground py-4 text-center text-sm"
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
