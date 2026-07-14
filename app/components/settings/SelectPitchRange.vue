<script setup lang="ts">
const props = defineProps<{
	localOnly?: boolean
}>()

const user = useUserStore()

const turntablePitchRange = ref(
	user.profile?.turntable_pitch_range.toString() ?? '8'
)

const turntablePitchOptions = [
	{ id: '8', name: '±8%' },
	{ id: '16', name: '±16%' },
	{ id: '24', name: '±24%' },
	{ id: '50', name: '±50%' }
]

watch(turntablePitchRange, (value) => {
	if (!props.localOnly)
		void user.updateSettings({ turntable_pitch_range: parseInt(value) })
})
</script>

<template>
	<div
		class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
	>
		<div class="space-y-1">
			<Label for="turntable-pitch-range">Turntable pitch range</Label>
			<p class="text-muted-foreground text-sm">
				Maximum pitch adjustment available on each deck.
			</p>
		</div>
		<Select v-model="turntablePitchRange">
			<SelectTrigger id="turntable-pitch-range" class="w-full sm:w-28">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					<SelectItem
						v-for="option in turntablePitchOptions"
						:key="option.id"
						:value="option.id"
					>
						{{ option.name }}
					</SelectItem>
				</SelectGroup>
			</SelectContent>
		</Select>
	</div>
</template>
