<script setup lang="ts">
interface Props {
	label: string
	value: string | number
	detail?: string
	tone?: 'default' | 'signal' | 'positive'
}

withDefaults(defineProps<Props>(), {
	tone: 'default'
})
</script>

<template>
	<div
		class="bg-workbench-inset border-border/80 min-w-0 rounded-sm border px-2.5 py-2"
	>
		<div class="flex items-baseline justify-between gap-2">
			<span
				class="text-muted-foreground truncate font-mono text-[0.55rem] tracking-[0.14em] uppercase"
			>
				{{ label }}
			</span>
			<span v-if="detail" class="text-muted-foreground truncate text-[0.62rem]">
				{{ detail }}
			</span>
		</div>
		<p
			class="mt-1 font-mono text-lg leading-none tracking-tight tabular-nums"
			:class="{
				'text-signal': tone === 'signal',
				'text-led': tone === 'positive'
			}"
		>
			{{ value }}
		</p>
	</div>
</template>
