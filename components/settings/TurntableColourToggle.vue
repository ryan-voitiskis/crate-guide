<script setup lang="ts">
import type { TurntableThemeOptions } from '~/types/options'

const user = useUserStore()

const silverDeckBackground = `linear-gradient(
    to right bottom,
    #8f8d97,
    #9d9ca6,
    #acacb4,
    #bbbcc3,
    #cbccd2,
    #cfd0d6,
    #d3d4d9,
    #d7d8dd,
    #d0d0d6,
    #c8c9cf,
    #c1c1c9,
    #babac2
  )`

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
		<Label class="[&:has([data-state=checked])>div]:border-primary">
			<RadioGroupItem value="silver" class="sr-only" />
			<div
				class="h-20 items-center rounded-[10px] border-2 border-muted p-1 hover:border-accent"
			>
				<div
					class="h-full w-full rounded-md"
					:style="`background: ${silverDeckBackground}`"
				/>
			</div>
			<span class="block w-full p-2 text-center font-normal">Silver</span>
		</Label>
		<Label class="[&:has([data-state=checked])>div]:border-primary">
			<RadioGroupItem value="dark" class="sr-only" />
			<div
				class="h-20 items-center rounded-[10px] border-2 border-muted bg-popover p-1 hover:bg-accent hover:text-accent-foreground"
			>
				<div
					class="h-full w-full rounded-md"
					:style="`background: ${blackDeckBackground}`"
				/>
			</div>
			<span class="block w-full p-2 text-center font-normal">Black</span>
		</Label>
	</RadioGroup>
</template>
