<script setup lang="ts">
import {
	AlertTriangle,
	CheckCircle2,
	Info,
	LoaderCircle
} from 'lucide-vue-next'

interface Props {
	tone?: 'neutral' | 'pending' | 'positive' | 'error'
	eyebrow?: string
	title: string
	description?: string
}

withDefaults(defineProps<Props>(), {
	tone: 'neutral'
})
</script>

<template>
	<div
		:role="tone === 'error' ? 'alert' : 'status'"
		:aria-live="tone === 'error' ? 'assertive' : 'polite'"
		class="bg-workbench-inset flex items-start gap-3 rounded-sm border p-3"
		:class="{
			'border-border': tone === 'neutral',
			'border-signal/35': tone === 'pending',
			'border-led/35': tone === 'positive',
			'border-destructive/45': tone === 'error'
		}"
	>
		<Info
			v-if="tone === 'neutral'"
			class="text-muted-foreground mt-0.5 size-4 shrink-0"
		/>
		<LoaderCircle
			v-else-if="tone === 'pending'"
			class="text-signal mt-0.5 size-4 shrink-0 animate-spin"
		/>
		<CheckCircle2
			v-else-if="tone === 'positive'"
			class="text-led mt-0.5 size-4 shrink-0"
		/>
		<AlertTriangle v-else class="text-destructive mt-0.5 size-4 shrink-0" />
		<div class="min-w-0">
			<p
				v-if="eyebrow"
				class="text-muted-foreground font-mono text-[9px] tracking-[0.14em] uppercase"
			>
				{{ eyebrow }}
			</p>
			<p class="text-sm font-medium" :class="eyebrow && 'mt-0.5'">
				{{ title }}
			</p>
			<p
				v-if="description"
				class="text-muted-foreground mt-1 text-xs leading-relaxed"
			>
				{{ description }}
			</p>
			<slot />
		</div>
	</div>
</template>
