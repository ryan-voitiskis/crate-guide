<script setup lang="ts">
import { Check, Circle } from 'lucide-vue-next'

interface Props {
	id?: string
	password?: string
}

const props = withDefaults(defineProps<Props>(), {
	password: ''
})

const requirements = computed(() => [
	{
		label: '8–64 characters',
		met: props.password.length >= 8 && props.password.length <= 64
	},
	{ label: 'One lowercase letter', met: /[a-z]/.test(props.password) },
	{ label: 'One uppercase letter', met: /[A-Z]/.test(props.password) },
	{ label: 'One number', met: /[0-9]/.test(props.password) }
])
</script>

<template>
	<div
		:id="id"
		class="bg-workbench-inset rounded-sm border px-3 py-2.5"
		aria-label="Password requirements"
	>
		<p
			class="text-muted-foreground mb-2 font-mono text-[9px] tracking-[0.14em] uppercase"
		>
			Password requirements
		</p>
		<ul class="grid gap-x-3 gap-y-1.5 sm:grid-cols-2">
			<li
				v-for="requirement in requirements"
				:key="requirement.label"
				class="flex items-center gap-1.5 text-[11px]"
				:class="requirement.met ? 'text-foreground' : 'text-muted-foreground'"
			>
				<Check v-if="requirement.met" class="text-led size-3 shrink-0" />
				<Circle v-else class="size-3 shrink-0" />
				<span>{{ requirement.label }}</span>
			</li>
		</ul>
	</div>
</template>
