<script setup lang="ts">
const { isActive, getHref, visibleNavItems } = useNavigation()
</script>

<template>
	<nav class="flex min-h-0 flex-1 flex-col p-2" aria-label="Library navigation">
		<div
			class="text-muted-foreground flex items-center justify-between px-2 pt-2 pb-2 font-mono text-[0.58rem] tracking-[0.18em] uppercase"
		>
			<span>Workspace</span>
			<span>CG-01</span>
		</div>

		<div class="space-y-0.5">
			<NuxtLink
				v-for="(item, index) in visibleNavItems"
				:key="item.path"
				:to="getHref(item.path)"
				class="group focus-visible:ring-ring relative flex h-9 items-center gap-2.5 rounded-sm border border-transparent px-2 text-[0.8rem] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
				:class="
					isActive(item.path)
						? 'border-border bg-background text-foreground shadow-xs'
						: 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
				"
			>
				<span
					v-if="isActive(item.path)"
					aria-hidden="true"
					class="bg-primary absolute top-1/2 -left-2 h-5 w-0.5 -translate-y-1/2"
				/>
				<component
					:is="item.icon"
					class="size-3.5 shrink-0"
					:class="isActive(item.path) ? 'text-primary' : ''"
				/>
				<span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
				<span class="font-mono text-[0.55rem] text-current/30 tabular-nums">
					{{ String(index + 1).padStart(2, '0') }}
				</span>
			</NuxtLink>
		</div>

		<div class="mt-auto px-2 pt-6 pb-2">
			<div class="border-border/70 border-t pt-3">
				<div
					class="text-muted-foreground flex items-center gap-2 font-mono text-[0.58rem] tracking-[0.12em] uppercase"
				>
					<span
						class="bg-led size-1.5 rounded-full shadow-[0_0_6px_var(--led)]"
					/>
					<span>Library online</span>
				</div>
				<p class="text-muted-foreground/65 mt-2 text-[0.65rem] leading-relaxed">
					Private collection data, organised for the booth.
				</p>
			</div>
		</div>
	</nav>
</template>
