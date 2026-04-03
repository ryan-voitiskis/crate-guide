<script setup lang="ts">
import type { AcceptableValue } from 'reka-ui'

const user = useUserStore()

function handleThemeChange(value: AcceptableValue) {
	if (typeof value === 'string') user.updateTheme(value as ThemeOptions)
}
</script>

<template>
	<Label>Theme</Label>
	<RadioGroup
		:model-value="user.currentTheme"
		class="grid max-w-3xl grid-cols-3 gap-4 pt-2"
		@update:model-value="handleThemeChange"
	>
		<Label class="[&:has([data-state=checked])>div]:border-primary flex-col">
			<RadioGroupItem value="auto" class="sr-only" />
			<div
				class="border-muted hover:border-accent items-center rounded-xl border-2 p-1"
			>
				<div
					class="space-y-2 rounded-md bg-[linear-gradient(to_right,#ecedef_50%,#020617_50%)] p-2"
				>
					<div
						class="flex items-center space-x-2 rounded-md bg-[linear-gradient(to_right,#ffffff_50%,#1e293b_50%)] p-2 shadow-xs"
					>
						<div
							class="h-4 w-4 rounded-full bg-[linear-gradient(to_right,#ecedef_50%,#94a3b8_50%)]"
						/>
						<div
							class="h-2 w-[100px] rounded-lg bg-[linear-gradient(to_right,#ecedef_50%,#94a3b8_50%)]"
						/>
					</div>
					<div
						class="space-y-2 rounded-md bg-[linear-gradient(to_right,#ffffff_50%,#1e293b_50%)] p-2 shadow-xs"
					>
						<div
							class="h-2 w-20 rounded-lg bg-[linear-gradient(to_right,#ecedef_50%,#94a3b8_50%)]"
						/>
						<div
							class="h-2 w-[100px] rounded-lg bg-[linear-gradient(to_right,#ecedef_50%,#94a3b8_50%)]"
						/>
					</div>
				</div>
			</div>
			<span class="block w-full p-2 text-center font-normal">Auto</span>
		</Label>
		<Label class="[&:has([data-state=checked])>div]:border-primary flex-col">
			<RadioGroupItem value="light" class="sr-only" />
			<div
				class="border-muted hover:border-accent items-center rounded-xl border-2 p-1"
			>
				<div class="space-y-2 rounded-md bg-[#ecedef] p-2">
					<div
						class="flex items-center space-x-2 rounded-md bg-white p-2 shadow-xs"
					>
						<div class="h-4 w-4 rounded-full bg-[#ecedef]" />
						<div class="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
					</div>
					<div class="space-y-2 rounded-md bg-white p-2 shadow-xs">
						<div class="h-2 w-20 rounded-lg bg-[#ecedef]" />
						<div class="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
					</div>
				</div>
			</div>
			<span class="block w-full p-2 text-center font-normal">Light</span>
		</Label>
		<Label class="[&:has([data-state=checked])>div]:border-primary flex-col">
			<RadioGroupItem value="dark" class="sr-only" />
			<div
				class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground items-center rounded-xl border-2 p-1"
			>
				<div class="space-y-2 rounded-md bg-slate-950 p-2">
					<div
						class="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-xs"
					>
						<div class="h-4 w-4 rounded-full bg-slate-400" />
						<div class="h-2 w-[100px] rounded-lg bg-slate-400" />
					</div>
					<div class="space-y-2 rounded-md bg-slate-800 p-2 shadow-xs">
						<div class="h-2 w-20 rounded-lg bg-slate-400" />
						<div class="h-2 w-[100px] rounded-lg bg-slate-400" />
					</div>
				</div>
			</div>
			<span class="block w-full p-2 text-center font-normal">Dark</span>
		</Label>
	</RadioGroup>
</template>
