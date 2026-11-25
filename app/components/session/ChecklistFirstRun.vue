<script setup lang="ts">
import { ArrowRight, Check, Circle, X } from '@lucide/vue'
import {
	FIRST_RUN_BPM_KEY_TARGET_PERCENT,
	type FirstRunChecklist
} from '~/utils/firstRunChecklist'

const props = defineProps<{
	checklist: FirstRunChecklist
}>()

const emit = defineEmits<{
	dismiss: []
}>()

const { getHref } = useNavigation()
const headingId = useId()

const coverageLabel = computed(() => {
	const { coverage } = props.checklist
	return `${coverage.percentWithBpmAndKey}% of your tracks have BPM and key`
})
const coverageDetail = computed(() => {
	const { coverage } = props.checklist
	return `${coverage.withBpmAndKey} of ${coverage.total}`
})
</script>

<template>
	<section
		class="border-border bg-workbench-inset mx-2 mt-2 rounded-sm border px-3 py-2.5 sm:mx-3 sm:mt-3"
		:aria-labelledby="headingId"
		data-testid="first-run-checklist"
	>
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h2 :id="headingId" class="text-sm font-semibold">
					Get your records gig-ready
				</h2>
				<p class="text-muted-foreground font-mono text-[10px] tracking-wide">
					{{ checklist.completedCount }} of {{ checklist.steps.length }} done
				</p>
			</div>
			<Button
				variant="ghost"
				size="icon"
				class="size-7 shrink-0"
				aria-label="Dismiss getting started checklist"
				data-testid="first-run-checklist-dismiss"
				@click="emit('dismiss')"
			>
				<X />
			</Button>
		</div>

		<div class="mt-2" data-testid="first-run-checklist-coverage">
			<div class="flex items-baseline justify-between gap-2 text-xs">
				<span class="font-medium">{{ coverageLabel }}</span>
				<span
					class="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums"
				>
					{{ coverageDetail }}
				</span>
			</div>
			<Progress
				class="mt-1 h-1.5"
				:model-value="checklist.coverage.percentWithBpmAndKey"
				:aria-label="coverageLabel"
			/>
		</div>

		<ol class="mt-2.5 grid gap-1.5 sm:grid-cols-5 sm:gap-2">
			<li
				v-for="step in checklist.steps"
				:key="step.id"
				class="border-border min-w-0 flex-col gap-1 rounded-xs border px-2 py-1.5 sm:flex"
				:class="step.done ? 'hidden opacity-70' : 'flex'"
				:data-step-id="step.id"
				:data-step-done="step.done"
			>
				<div class="flex items-center gap-1.5 text-xs font-medium">
					<Check
						v-if="step.done"
						class="text-led size-3.5 shrink-0"
						aria-hidden="true"
					/>
					<Circle
						v-else
						class="text-muted-foreground size-3.5 shrink-0"
						aria-hidden="true"
					/>
					<span class="truncate">{{ step.label }}</span>
					<span class="sr-only">{{ step.done ? '(done)' : '(to do)' }}</span>
				</div>
				<!-- Phones hide descriptions to save deck space, except for a step
				with no link, where the description is the only instruction. -->
				<p
					v-if="!step.done"
					class="text-muted-foreground text-[11px] leading-snug sm:block"
					:class="step.path === null ? 'block' : 'hidden'"
				>
					<template v-if="step.id === 'add-bpm-key'">
						Aim for {{ FIRST_RUN_BPM_KEY_TARGET_PERCENT }}% or more.
					</template>
					{{ step.description }}
				</p>
				<NuxtLink
					v-if="!step.done && step.path !== null"
					:to="getHref(step.path)"
					class="text-primary mt-auto inline-flex items-center gap-1 text-[11px] font-medium underline-offset-4 hover:underline"
				>
					{{ step.actionLabel }}
					<ArrowRight class="size-3" aria-hidden="true" />
				</NuxtLink>
			</li>
		</ol>
	</section>
</template>
