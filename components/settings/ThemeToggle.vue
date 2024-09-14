<script setup lang="ts">
const user = useUserStore()

const theme = ref<ThemeOptions>(
	isThemeOption(user.profile?.ui_theme) ? user.profile?.ui_theme : 'light'
)

watch(theme, (theme) => setTheme(theme))
</script>

<template>
	<Label>Theme</Label>
	<RadioGroup v-model="theme" class="grid max-w-md grid-cols-2 gap-8 pt-2">
		<Label class="[&:has([data-state=checked])>div]:border-primary">
			<RadioGroupItem value="light" class="sr-only" />
			<div
				class="items-center rounded-xl border-2 border-muted p-1 hover:border-accent"
			>
				<div class="space-y-2 rounded-md bg-[#ecedef] p-2">
					<div
						class="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm"
					>
						<div class="h-4 w-4 rounded-full bg-[#ecedef]" />
						<div class="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
					</div>
					<div class="space-y-2 rounded-md bg-white p-2 shadow-sm">
						<div class="h-2 w-20 rounded-lg bg-[#ecedef]" />
						<div class="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
					</div>
				</div>
			</div>
			<span class="block w-full p-2 text-center font-normal">Light</span>
		</Label>
		<Label class="[&:has([data-state=checked])>div]:border-primary">
			<RadioGroupItem value="dark" class="sr-only" />
			<div
				class="items-center rounded-xl border-2 border-muted bg-popover p-1 hover:bg-accent hover:text-accent-foreground"
			>
				<div class="space-y-2 rounded-md bg-slate-950 p-2">
					<div
						class="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-sm"
					>
						<div class="h-4 w-4 rounded-full bg-slate-400" />
						<div class="h-2 w-[100px] rounded-lg bg-slate-400" />
					</div>
					<div class="space-y-2 rounded-md bg-slate-800 p-2 shadow-sm">
						<div class="h-2 w-20 rounded-lg bg-slate-400" />
						<div class="h-2 w-[100px] rounded-lg bg-slate-400" />
					</div>
				</div>
			</div>
			<span class="block w-full p-2 text-center font-normal">Dark</span>
		</Label>
	</RadioGroup>
</template>
