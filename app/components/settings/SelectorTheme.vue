<script setup lang="ts">
import type { AcceptableValue } from 'reka-ui'

const props = defineProps<{
	localOnly?: boolean
}>()

const user = useWorkbenchUserStore()
const localTheme = ref<ThemeOptions>(user.currentTheme)

const selectedTheme = computed(() =>
	props.localOnly ? localTheme.value : user.currentTheme
)

function handleThemeChange(value: AcceptableValue) {
	if (typeof value !== 'string') return
	const theme = value as ThemeOptions
	if (props.localOnly) {
		localTheme.value = theme
		user.setLocalTheme(theme)
		return
	}
	void user.updateTheme(theme)
}
</script>

<template>
	<div class="space-y-3">
		<div class="space-y-1">
			<Label>Theme</Label>
			<p class="text-muted-foreground text-xs">
				Follow your system or lock the workspace to one environment.
			</p>
		</div>
		<RadioGroup
			:model-value="selectedTheme"
			class="grid grid-cols-1 gap-2 sm:grid-cols-3"
			@update:model-value="handleThemeChange"
		>
			<Label
				class="border-border hover:bg-muted/40 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 flex cursor-pointer items-center gap-3 rounded-sm border p-2 transition-colors sm:flex-col sm:items-stretch sm:gap-2"
			>
				<RadioGroupItem value="auto" class="sr-only" />
				<div
					class="grid h-10 w-20 shrink-0 grid-cols-2 overflow-hidden rounded-[2px] border sm:h-14 sm:w-full"
					aria-hidden="true"
				>
					<div class="bg-[#f0eee8] p-1.5">
						<div class="h-full border border-[#d4d0c5] bg-white" />
					</div>
					<div class="bg-[#11110f] p-1.5">
						<div class="h-full border border-[#373632] bg-[#22211e]" />
					</div>
				</div>
				<div class="min-w-0 sm:text-center">
					<span class="block text-xs font-medium">Auto</span>
					<span class="text-muted-foreground font-mono text-[10px]">
						SYSTEM
					</span>
				</div>
			</Label>

			<Label
				class="border-border hover:bg-muted/40 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 flex cursor-pointer items-center gap-3 rounded-sm border p-2 transition-colors sm:flex-col sm:items-stretch sm:gap-2"
			>
				<RadioGroupItem value="light" class="sr-only" />
				<div
					class="h-10 w-20 shrink-0 overflow-hidden rounded-[2px] border bg-[#f0eee8] p-1.5 sm:h-14 sm:w-full"
					aria-hidden="true"
				>
					<div class="flex h-full gap-1 border border-[#d4d0c5] bg-white p-1">
						<div class="w-1/4 bg-[#e2ded4]" />
						<div class="flex-1 border-y border-[#e2ded4]" />
					</div>
				</div>
				<div class="min-w-0 sm:text-center">
					<span class="block text-xs font-medium">Light</span>
					<span class="text-muted-foreground font-mono text-[10px]">PAPER</span>
				</div>
			</Label>

			<Label
				class="border-border hover:bg-muted/40 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 flex cursor-pointer items-center gap-3 rounded-sm border p-2 transition-colors sm:flex-col sm:items-stretch sm:gap-2"
			>
				<RadioGroupItem value="dark" class="sr-only" />
				<div
					class="h-10 w-20 shrink-0 overflow-hidden rounded-[2px] border border-[#383733] bg-[#11110f] p-1.5 sm:h-14 sm:w-full"
					aria-hidden="true"
				>
					<div
						class="flex h-full gap-1 border border-[#373632] bg-[#22211e] p-1"
					>
						<div class="w-1/4 bg-[#393834]" />
						<div class="flex-1 border-y border-[#393834]" />
					</div>
				</div>
				<div class="min-w-0 sm:text-center">
					<span class="block text-xs font-medium">Dark</span>
					<span class="text-muted-foreground font-mono text-[10px]">BOOTH</span>
				</div>
			</Label>
		</RadioGroup>
	</div>
</template>
