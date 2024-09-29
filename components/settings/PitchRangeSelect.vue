<script setup lang="ts">
const user = useUserStore()

// v-model needs to be a string, hence the conversion
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
	user.updateSettings({ turntable_pitch_range: parseInt(value) })
})
</script>

<template>
	<div class="flex items-center justify-between">
		<Label class="">Turntable pitch range</Label>
		<Select v-model="turntablePitchRange">
			<SelectTrigger class="w-auto">
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
