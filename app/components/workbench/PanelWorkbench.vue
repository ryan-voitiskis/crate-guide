<script setup lang="ts">
interface Props {
	eyebrow?: string
	title?: string
	description?: string
	flush?: boolean
}

withDefaults(defineProps<Props>(), {
	flush: false
})
</script>

<template>
	<section
		class="border-border bg-card relative rounded-md border shadow-xs"
		:class="flush ? 'overflow-hidden' : 'p-3 sm:p-4'"
	>
		<span
			aria-hidden="true"
			class="border-foreground/15 pointer-events-none absolute -top-px -left-px size-2 border-t border-l"
		/>
		<span
			aria-hidden="true"
			class="border-foreground/15 pointer-events-none absolute -right-px -bottom-px size-2 border-r border-b"
		/>

		<header
			v-if="eyebrow || title || description || $slots.actions"
			class="flex min-w-0 items-start justify-between gap-4"
			:class="flush ? 'border-border border-b px-3 py-2.5 sm:px-4' : 'mb-3'"
		>
			<div class="min-w-0">
				<p
					v-if="eyebrow"
					class="text-muted-foreground mb-1 font-mono text-[0.58rem] tracking-[0.16em] uppercase"
				>
					{{ eyebrow }}
				</p>
				<h2 v-if="title" class="truncate text-sm font-semibold tracking-tight">
					{{ title }}
				</h2>
				<p v-if="description" class="text-muted-foreground mt-0.5 text-xs">
					{{ description }}
				</p>
			</div>
			<div v-if="$slots.actions" class="shrink-0">
				<slot name="actions" />
			</div>
		</header>

		<div>
			<slot />
		</div>
	</section>
</template>
