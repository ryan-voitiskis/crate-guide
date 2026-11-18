<script setup lang="ts">
import { Check } from '@lucide/vue'

defineProps<{
	currentStep: 1 | 2 | 3
	disabled: boolean
	canNavigateToStep: (step: number) => boolean
	isStepComplete: (step: number) => boolean
}>()

const emit = defineEmits<{
	navigate: [step: number]
}>()

const workflowSteps = [
	{ number: 1, label: 'Choose source', shortLabel: 'Source' },
	{ number: 2, label: 'Review matches', shortLabel: 'Review' },
	{ number: 3, label: 'Apply updates', shortLabel: 'Apply' }
] as const
</script>

<template>
	<nav
		class="border-border bg-background/60 flex items-center gap-0.5 rounded-sm border p-0.5"
		aria-label="Enrichment workflow"
	>
		<button
			v-for="step in workflowSteps"
			:key="step.number"
			type="button"
			data-testid="enrichment-workflow-step"
			:disabled="disabled || !canNavigateToStep(step.number)"
			:aria-label="step.label"
			:aria-current="currentStep === step.number ? 'step' : undefined"
			class="flex h-7 items-center gap-1.5 rounded-[2px] px-1.5 text-xs transition-colors disabled:cursor-default"
			:class="
				currentStep === step.number
					? 'bg-muted text-foreground'
					: canNavigateToStep(step.number)
						? 'text-muted-foreground hover:text-foreground'
						: 'text-muted-foreground/45'
			"
			@click="emit('navigate', step.number)"
		>
			<span
				class="flex size-4 items-center justify-center rounded-[2px] border font-mono text-[9px] font-semibold"
				:class="
					isStepComplete(step.number)
						? 'border-primary bg-primary text-primary-foreground'
						: currentStep === step.number
							? 'border-foreground text-foreground'
							: 'border-current'
				"
			>
				<Check v-if="isStepComplete(step.number)" class="size-3" />
				<span v-else>{{ step.number }}</span>
			</span>
			<span class="hidden lg:inline">{{ step.shortLabel }}</span>
		</button>
	</nav>
</template>
