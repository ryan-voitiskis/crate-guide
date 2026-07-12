<script setup lang="ts">
const user = useUserStore()

const silverDeckBackground = `linear-gradient(
    135deg,
    #d8d8cc 0%,
    #cacabd 16%,
    #e1e0d5 34%,
    #c5c5b8 52%,
    #dad9cd 70%,
    #babab0 100%
  )`
const silverDeckOverlay = `radial-gradient(
    circle at 12% 11%,
    rgba(255, 255, 246, 0.64) 0%,
    rgba(255, 255, 246, 0.22) 9%,
    transparent 21%
  ), radial-gradient(
    ellipse at 78% 17%,
    rgba(255, 255, 244, 0.36) 0%,
    transparent 34%
  ), radial-gradient(
    ellipse at 86% 82%,
    rgba(91, 91, 86, 0.16) 0%,
    transparent 48%
  )`
const silverDeckMaterial = `${silverDeckOverlay}, ${silverDeckBackground}`

const blackDeckBackground = `linear-gradient(
    to right bottom,
    #282727,
    #2d2c2c,
    #323132,
    #373737,
    #3c3c3c,
    #3c3c3c,
    #3c3c3c,
    #3c3c3c,
    #373737,
    #323132,
    #2d2c2c,
    #282727
  )`

function isTurntableThemeOption(
	value?: string
): value is TurntableThemeOptions {
	if (!value) return false
	return ['silver', 'black'].includes(value)
}

const turntableTheme = ref<TurntableThemeOptions>(
	isTurntableThemeOption(user.profile?.turntable_theme)
		? user.profile.turntable_theme
		: 'silver'
)

watch(turntableTheme, (theme) => {
	user.updateSettings({ turntable_theme: theme })
})
</script>

<template>
	<Label>Turntable colour</Label>
	<RadioGroup
		v-model="turntableTheme"
		class="grid max-w-md grid-cols-2 gap-4 pt-2"
	>
		<Label class="[&:has([data-state=checked])>div]:border-primary flex-col">
			<RadioGroupItem value="silver" class="sr-only" />
			<div
				class="border-muted hover:border-accent w-full items-center rounded-xl border-2 p-1"
			>
				<div
					class="h-24 w-full rounded-md"
					:style="`background: ${silverDeckMaterial}`"
				/>
			</div>
			<span class="block w-full p-2 text-center font-normal">Silver</span>
		</Label>
		<Label class="[&:has([data-state=checked])>div]:border-primary flex-col">
			<RadioGroupItem value="black" class="sr-only" />
			<div
				class="border-muted hover:border-accent w-full items-center rounded-xl border-2 p-1"
			>
				<div
					class="h-24 w-full rounded-md"
					:style="`background: ${blackDeckBackground}`"
				/>
			</div>
			<span class="block w-full p-2 text-center font-normal">Black</span>
		</Label>
	</RadioGroup>
</template>
