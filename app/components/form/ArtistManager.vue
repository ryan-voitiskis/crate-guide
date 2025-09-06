<script setup lang="ts">
import { Plus, Trash } from 'lucide-vue-next'

interface Props {
	modelValue: DiscogsArtistDb[]
	title: string
	rolePlaceholder?: string
	required?: boolean
}

interface Emits {
	(e: 'update:modelValue', value: DiscogsArtistDb[]): void
}

const props = withDefaults(defineProps<Props>(), {
	rolePlaceholder: 'Role',
	required: false
})

const emit = defineEmits<Emits>()

// Computed
const artists = computed({
	get: () => props.modelValue,
	set: (value) => emit('update:modelValue', value)
})

// Functions
function addArtist() {
	const newArtists = [
		...artists.value,
		{ name: '', discogs_id: undefined, role: null }
	]
	artists.value = newArtists
}

function removeArtist(index: number) {
	const newArtists = artists.value.filter((_, i) => i !== index)
	artists.value = newArtists
}

function updateArtist(index: number, field: keyof DiscogsArtistDb, value: any) {
	const newArtists = [...artists.value]
	newArtists[index] = {
		...newArtists[index],
		[field]: value
	} as DiscogsArtistDb
	artists.value = newArtists
}
</script>

<template>
	<div class="space-y-4">
		<div class="flex items-center justify-between">
			<Label>
				{{ title }}
				<span v-if="required" class="text-destructive">*</span>
			</Label>
			<Button @click="addArtist" size="sm" variant="outline">
				<Plus class="mr-2 size-4" />
				Add Artist
			</Button>
		</div>

		<div v-if="artists.length" class="space-y-2">
			<div
				v-for="(artist, index) in artists"
				:key="index"
				class="flex items-center gap-2"
			>
				<Input
					:model-value="artist.name"
					@update:model-value="updateArtist(index, 'name', $event)"
					name="artist-name"
					placeholder="Artist name"
					class="flex-1"
				/>
				<Input
					:model-value="artist.discogs_id ?? undefined"
					@update:model-value="
						updateArtist(
							index,
							'discogs_id',
							$event ? Number($event) : undefined
						)
					"
					name="artist-discogs-id"
					type="number"
					placeholder="Discogs ID"
					class="w-32"
				/>
				<Input
					:model-value="artist.role ?? undefined"
					@update:model-value="
						updateArtist(index, 'role', $event ? String($event) : null)
					"
					name="artist-role"
					:placeholder="rolePlaceholder"
					class="w-40"
				/>
				<Button
					@click="removeArtist(index)"
					size="sm"
					variant="ghost"
					class="text-destructive"
				>
					<Trash class="size-4" />
				</Button>
			</div>
		</div>
	</div>
</template>
