<script setup lang="ts">
const emit = defineEmits<{
	navigate: []
}>()

const { isActive, getHref } = useNavigation()

function handleNavigate() {
	emit('navigate')
}
</script>

<template>
	<nav class="flex flex-col gap-1">
		<NuxtLink
			v-for="item in navItems"
			:key="item.path"
			:to="getHref(item.path)"
			class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
			:class="
				isActive(item.path)
					? 'bg-accent text-accent-foreground'
					: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
			"
			@click="handleNavigate"
		>
			<component :is="item.icon" class="size-4" />
			{{ item.label }}
		</NuxtLink>
	</nav>
</template>
