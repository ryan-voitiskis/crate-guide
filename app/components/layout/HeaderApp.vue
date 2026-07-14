<script setup lang="ts">
import { Menu } from 'lucide-vue-next'

const user = useSupabaseUser()
const route = useRoute()
const isDemo = computed(() => route.path.startsWith('/demo'))
const isSheetOpen = ref(false)
const homePath = computed(() => (isDemo.value ? '/demo' : '/'))

// Close sheet on navigation
watch(
	() => route.path,
	() => {
		isSheetOpen.value = false
	}
)
</script>

<template>
	<header
		class="bg-workbench-chrome text-workbench-chrome-foreground relative z-30 flex h-12 w-full border-b border-white/10 shadow-md"
	>
		<div
			class="hidden w-52 shrink-0 items-center border-r border-white/10 px-3 lg:flex"
		>
			<NuxtLink
				:to="homePath"
				class="focus-visible:ring-signal flex min-w-0 items-center gap-2.5 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
				aria-label="Crate Guide home"
			>
				<span class="relative size-7 shrink-0">
					<LogoCrateGuide class="size-full" />
					<span
						aria-hidden="true"
						class="bg-led ring-workbench-chrome absolute right-0 bottom-0 size-1.5 rounded-full ring-2"
					/>
				</span>
				<span class="min-w-0 leading-none">
					<span
						class="block truncate text-[0.82rem] font-semibold tracking-tight"
					>
						Crate Guide
					</span>
					<span
						class="mt-1 block font-mono text-[0.55rem] tracking-[0.18em] text-white/40 uppercase"
					>
						Library system
					</span>
				</span>
			</NuxtLink>
		</div>

		<div class="flex min-w-0 flex-1 items-center gap-2 px-2 sm:px-3">
			<NuxtLink
				:to="homePath"
				class="focus-visible:ring-signal flex shrink-0 items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:outline-none lg:hidden"
				aria-label="Crate Guide home"
			>
				<LogoCrateGuide class="size-7" />
				<span class="hidden text-xs font-semibold tracking-tight sm:inline">
					Crate Guide
				</span>
			</NuxtLink>

			<div class="mx-1 hidden h-5 w-px bg-white/10 sm:block lg:hidden" />

			<!-- Page-specific actions retain the existing teleport contract. -->
			<div
				id="header-left"
				class="scrollbar-hidden flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [&>*]:shrink-0"
			/>

			<div v-if="isDemo" class="hidden shrink-0 items-center gap-2 sm:flex">
				<span
					class="bg-signal size-1.5 rounded-full shadow-[0_0_8px_var(--signal)]"
				/>
				<span
					class="font-mono text-[0.6rem] tracking-[0.16em] text-white/55 uppercase"
				>
					Demo source
				</span>
			</div>

			<ControlTransferWorkbench variant="mobile" />
			<ControlDensityWorkbench />
			<CommandWorkbench />

			<div v-if="user || isDemo" class="flex shrink-0 lg:hidden">
				<Sheet v-model:open="isSheetOpen">
					<SheetTrigger as-child>
						<Button
							variant="ghost"
							size="icon"
							class="text-workbench-chrome-foreground hover:bg-white/10 hover:text-white"
							aria-label="Open navigation"
						>
							<Menu class="size-5" />
						</Button>
					</SheetTrigger>
					<SheetContent
						side="left"
						class="bg-sidebar flex w-72 flex-col gap-0 p-0"
					>
						<SheetHeader class="border-border border-b px-4 py-4 text-left">
							<SheetTitle>
								<span>Crate Guide</span>
							</SheetTitle>
							<SheetDescription
								class="font-mono text-[0.65rem] tracking-widest uppercase"
							>
								{{ isDemo ? 'Demo library' : 'Collection workbench' }}
							</SheetDescription>
						</SheetHeader>
						<div class="min-h-0 flex-1 overflow-y-auto p-2">
							<NavMainMobile @navigate="isSheetOpen = false" />
						</div>
					</SheetContent>
				</Sheet>
			</div>
		</div>
	</header>
</template>
