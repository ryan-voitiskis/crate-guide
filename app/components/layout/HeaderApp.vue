<script setup lang="ts">
import { Menu } from 'lucide-vue-next'

const user = useSupabaseUser()
const route = useRoute()
const isDemo = computed(() => route.path.startsWith('/demo'))
const isSheetOpen = ref(false)

// Close sheet on navigation
watch(
	() => route.path,
	() => {
		isSheetOpen.value = false
	}
)
</script>

<template>
	<header class="pointer-events-none sticky top-0 z-10 flex w-full p-2">
		<div
			class="mx-auto flex w-full max-w-[1600px] items-center justify-between"
		>
			<!-- Left: Page-specific UI (teleport target) -->
			<div
				id="header-left"
				class="pointer-events-auto flex items-center gap-2"
			/>

			<!-- Right: Desktop nav -->
			<div
				v-if="user || isDemo"
				class="pointer-events-auto hidden items-center gap-2 md:flex"
			>
				<span
					v-if="isDemo"
					class="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400"
				>
					Demo Mode
				</span>
				<NavMain />
			</div>

			<!-- Right: Mobile hamburger -->
			<div v-if="user || isDemo" class="pointer-events-auto flex md:hidden">
				<Sheet v-model:open="isSheetOpen">
					<SheetTrigger as-child>
						<Button variant="ghost" size="icon">
							<Menu class="size-5" />
						</Button>
					</SheetTrigger>
					<SheetContent side="right" class="w-72">
						<SheetHeader>
							<SheetTitle>
								<span v-if="isDemo">Demo Mode</span>
								<span v-else>Menu</span>
							</SheetTitle>
							<SheetDescription class="sr-only">
								Primary navigation menu
							</SheetDescription>
						</SheetHeader>
						<div class="mt-4">
							<NavMainMobile @navigate="isSheetOpen = false" />
						</div>
					</SheetContent>
				</Sheet>
			</div>
		</div>
	</header>
</template>
