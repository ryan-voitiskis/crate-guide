<script setup lang="ts">
interface Props {
	section?: string
}

withDefaults(defineProps<Props>(), {
	section: 'Public access'
})

const route = useRoute()
const user = useSupabaseUser()
const primaryDestination = computed(() =>
	user.value ? { to: '/', label: 'Workbench' } : { to: '/demo', label: 'Demo' }
)
</script>

<template>
	<header
		class="bg-workbench-inset text-foreground border-border flex h-12 shrink-0 items-center border-b px-2 sm:px-3"
	>
		<NuxtLink
			to="/demo"
			class="focus-visible:ring-ring flex min-w-0 items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
			aria-label="Crate Guide demo"
		>
			<span class="size-7 shrink-0"><LogoCrateGuide /></span>
			<span class="hidden min-w-0 sm:block">
				<span class="block truncate text-xs leading-none font-semibold">
					Crate Guide
				</span>
				<span
					class="text-muted-foreground mt-1 block truncate font-mono text-[9px] leading-none tracking-[0.14em] uppercase"
				>
					{{ section }}
				</span>
			</span>
		</NuxtLink>

		<div
			class="text-muted-foreground ml-2 hidden items-center gap-2 font-mono text-[10px] tracking-[0.12em] uppercase md:flex"
		>
			<span aria-hidden="true">/</span>
			<span>Anonymous console</span>
		</div>

		<nav class="ml-auto flex items-center gap-1" aria-label="Public navigation">
			<Button
				v-if="route.path !== primaryDestination.to"
				variant="ghost"
				size="sm"
				class="text-muted-foreground hover:text-foreground hover:bg-muted h-11 px-3 text-xs"
				as-child
			>
				<NuxtLink :to="primaryDestination.to">
					{{ primaryDestination.label }}
				</NuxtLink>
			</Button>
			<Button
				v-if="!user && route.path !== '/login'"
				variant="ghost"
				size="sm"
				class="text-muted-foreground hover:text-foreground hover:bg-muted h-11 px-3 text-xs"
				as-child
			>
				<NuxtLink to="/login">Log in</NuxtLink>
			</Button>
			<ToggleTheme />
		</nav>
	</header>
</template>
