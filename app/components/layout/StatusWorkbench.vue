<script setup lang="ts">
import { buildWorkspaceStatusPresentation } from '~/utils/workspaceStatusPresentation'

const route = useRoute()
const { isActive, visibleNavItems } = useNavigation()
const online = useOnline()
const capabilities = useWorkbenchCapabilities()

const workspaceStatus = computed(() =>
	buildWorkspaceStatusPresentation({
		location: capabilities.location,
		connectivity: online.value ? 'online' : 'offline'
	})
)

const presentation = computed(() =>
	workspaceStatus.value.status === 'known' ? workspaceStatus.value : null
)

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
		class="bg-workbench-inset text-foreground border-border flex h-6 items-center justify-between border-t px-2.5 font-mono text-[0.55rem] tracking-[0.12em] uppercase sm:px-3"
		aria-label="Workspace status"
	>
		<div class="flex min-w-0 items-center gap-2.5">
			<span
				class="size-1.5 shrink-0 rounded-full"
				:class="
					presentation?.connectivity.state === 'online'
						? 'bg-led shadow-[0_0_6px_var(--led)]'
						: 'bg-signal'
				"
			/>
			<span class="text-foreground/80 truncate">
				{{ presentation?.connectivity.label ?? 'Workspace unavailable' }}
			</span>
			<span class="text-muted-foreground/50 hidden sm:inline">/</span>
			<span class="text-muted-foreground hidden truncate sm:inline">
				{{ currentSection }}
			</span>
		</div>
		<div class="text-muted-foreground flex shrink-0 items-center gap-2.5">
			<ControlTransferWorkbench />
			<span class="hidden md:inline">
				{{ presentation?.location.label ?? 'Unknown library' }}
			</span>
			<span class="text-muted-foreground/50 hidden md:inline">•</span>
			<span class="hidden md:inline">
				{{ presentation?.backup.label ?? 'Backup unknown' }}
			</span>
			<span class="text-muted-foreground/50 hidden md:inline">•</span>
			<span>CG · 33⅓</span>
		</div>
	</footer>
</template>
