<script setup lang="ts">
const { isActive, getHref, visibleNavItems } = useNavigation()

// Classes extracted from TabsTrigger
const baseClasses = `inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`

const focusClasses = `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring`

const activeClasses = `bg-background text-foreground dark:border-input dark:bg-input/30 shadow-sm`

const inactiveClasses = `text-foreground dark:text-muted-foreground`
</script>

<template>
	<nav
		class="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]"
	>
		<NuxtLink
			v-for="item in visibleNavItems"
			:key="item.path"
			:to="getHref(item.path)"
			:class="[
				baseClasses,
				focusClasses,
				isActive(item.path) ? activeClasses : inactiveClasses
			]"
		>
			<component :is="item.icon" class="size-4" />
			{{ item.label }}
		</NuxtLink>
	</nav>
</template>
