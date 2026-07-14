<script setup lang="ts">
const emit = defineEmits<{
	navigate: []
}>()

const { isActive, getHref, visibleNavItems } = useNavigation()

function handleNavigate() {
	emit('navigate')
}
</script>

<template>
	<nav class="flex flex-col gap-0.5" aria-label="Library navigation">
		<NuxtLink
			v-for="(item, index) in visibleNavItems"
			:key="item.path"
			:to="getHref(item.path)"
			class="focus-visible:ring-ring flex h-10 items-center gap-3 rounded-sm border border-transparent px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
			:class="
				isActive(item.path)
					? 'border-border bg-background text-foreground shadow-xs'
					: 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
			"
			@click="handleNavigate"
		>
			<component
				:is="item.icon"
				class="size-4"
				:class="isActive(item.path) ? 'text-primary' : ''"
			/>
			<span class="flex-1">{{ item.label }}</span>
			<span class="font-mono text-[0.6rem] text-current/35 tabular-nums">
				{{ String(index + 1).padStart(2, '0') }}
			</span>
		</NuxtLink>
	</nav>
</template>
