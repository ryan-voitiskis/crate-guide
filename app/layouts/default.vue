<script setup lang="ts">
const density = useState<'compact' | 'comfortable'>(
	'workbench-density',
	() => 'compact'
)

onMounted(() => {
	const savedDensity = localStorage.getItem('crate-guide-density')
	if (savedDensity === 'compact' || savedDensity === 'comfortable') {
		density.value = savedDensity
	}
})
</script>

<template>
	<div
		:data-workbench-density="density"
		class="flex h-full min-h-0 flex-col overflow-hidden"
	>
		<HeaderApp class="shrink-0" />
		<div class="flex min-h-0 flex-1">
			<aside
				class="bg-sidebar border-sidebar-border hidden w-52 shrink-0 border-r lg:flex lg:flex-col"
			>
				<NavMain />
			</aside>
			<main class="min-w-0 flex-1 overflow-hidden">
				<slot />
			</main>
		</div>
		<StatusWorkbench class="shrink-0" />
	</div>
</template>
