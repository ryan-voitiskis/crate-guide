<script setup lang="ts">
import { Monitor, Moon, Sun } from 'lucide-vue-next'

const user = useUserStore()

const order: ThemeOptions[] = ['light', 'dark', 'auto']
const labels: Record<ThemeOptions, string> = {
	light: 'Light',
	dark: 'Dark',
	auto: 'Auto'
}

const current = computed<ThemeOptions>(() => user.currentTheme)
const label = computed(() => `Theme: ${labels[current.value]}`)

function cycle() {
	const idx = order.indexOf(current.value)
	const next = order[(idx + 1) % order.length] ?? 'auto'
	// On unauthenticated auth pages skip the DB write path — otherwise a
	// stale/partial session could surface profile-update error toasts
	// unrelated to what the user was doing.
	if (user.supaUserId) user.updateTheme(next)
	else user.setLocalTheme(next)
}
</script>

<template>
	<button
		type="button"
		:aria-label="label"
		:title="label"
		class="group border-border text-muted-foreground hover:text-foreground focus-visible:ring-ring hover:bg-muted relative inline-flex size-11 items-center justify-center rounded-sm border bg-transparent transition-colors focus-visible:ring-2 focus-visible:outline-none"
		@click="cycle"
	>
		<Sun
			v-if="current === 'light'"
			class="size-4 transition-transform group-hover:rotate-45"
		/>
		<Moon
			v-else-if="current === 'dark'"
			class="size-4 transition-transform group-hover:-rotate-12"
		/>
		<Monitor v-else class="size-4" />
		<span class="sr-only">{{ label }}</span>
	</button>
</template>
