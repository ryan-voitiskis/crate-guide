<script setup lang="ts">
const route = useRoute()
const { isDemo, isActive, visibleNavItems } = useNavigation()
const online = useOnline()

const currentSection = computed(() => {
	const navLabel = visibleNavItems.value.find((item) =>
		isActive(item.path)
	)?.label
	if (navLabel) return navLabel
	return typeof route.meta.title === 'string' ? route.meta.title : 'Library'
})
</script>

<template>
	<footer
		class="bg-workbench-chrome text-workbench-chrome-foreground flex h-6 items-center justify-between border-t border-white/10 px-2.5 font-mono text-[0.55rem] tracking-[0.12em] uppercase sm:px-3"
		aria-label="Workspace status"
	>
		<div class="flex min-w-0 items-center gap-2.5">
			<span
				class="size-1.5 shrink-0 rounded-full"
				:class="online ? 'bg-led shadow-[0_0_6px_var(--led)]' : 'bg-signal'"
			/>
			<span class="truncate text-white/65">
				{{
					isDemo ? 'Read-only demo' : online ? 'Library ready' : 'Offline mode'
				}}
			</span>
			<span class="hidden text-white/20 sm:inline">/</span>
			<span class="hidden truncate text-white/40 sm:inline">
				{{ currentSection }}
			</span>
		</div>
		<div class="flex shrink-0 items-center gap-2.5 text-white/35">
			<ControlTransferWorkbench />
			<span class="hidden md:inline">Local-first workspace</span>
			<span class="hidden text-white/20 md:inline">•</span>
			<span>CG · 33⅓</span>
		</div>
	</footer>
</template>
