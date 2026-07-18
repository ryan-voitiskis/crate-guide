<script setup lang="ts">
import { isPublicRoute } from '../utils/authRoutes'

const route = useRoute()
const user = useSupabaseUser()

const showWorkbench = computed(
	() =>
		Boolean(user.value) ||
		route.path.startsWith('/demo') ||
		!isPublicRoute(route.path)
)
const showPublicProjectLinks = computed(() => !showWorkbench.value)

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
	<div class="contents">
		<div
			v-if="showWorkbench"
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
		<div
			v-else
			data-public-page-scroll-container
			class="h-full min-h-0 overflow-y-auto overscroll-contain"
		>
			<div class="flex min-h-full flex-col">
				<div class="min-h-0 flex-1">
					<slot />
				</div>
				<LinksLegal
					v-if="showPublicProjectLinks"
					class="shrink-0 justify-center px-4 pb-6 sm:pb-8"
				/>
			</div>
		</div>
	</div>
</template>
