<script setup lang="ts">
import { Rows3 } from 'lucide-vue-next'

const density = useState<'compact' | 'comfortable'>(
	'workbench-density',
	() => 'compact'
)

const nextDensity = computed(() =>
	density.value === 'compact' ? 'comfortable' : 'compact'
)

function toggleDensity() {
	density.value = nextDensity.value
	localStorage.setItem('crate-guide-density', density.value)
}
</script>

<template>
	<button
		type="button"
		class="focus-visible:ring-signal border-border text-muted-foreground hover:text-foreground hover:bg-muted flex h-8 shrink-0 items-center gap-1.5 rounded-sm border px-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
		:title="`Switch to ${nextDensity} density`"
		:aria-label="`Workspace density: ${density}. Switch to ${nextDensity}.`"
		@click="toggleDensity"
	>
		<Rows3 class="size-3.5" />
		<span
			class="hidden font-mono text-[0.55rem] tracking-widest uppercase xl:inline"
		>
			{{ density === 'compact' ? 'Dense' : 'Cozy' }}
		</span>
	</button>
</template>
