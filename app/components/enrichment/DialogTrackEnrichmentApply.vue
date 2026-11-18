<script setup lang="ts">
import { ShieldCheck, Upload } from '@lucide/vue'

const props = defineProps<{
	open: boolean
	stagedCount: number
	stagedEvidenceCount: number
	stagedEvidenceOnlyCount: number
	stagedBpmCount: number
	stagedKeyModeCount: number
	isApplying: boolean
	applyCompleted: number
	applyTotal: number
	applyProgress: number
}>()

const emit = defineEmits<{
	'update:open': [open: boolean]
	confirm: []
}>()

// A writable computed (not defineModel) so every write reaches the parent,
// exactly like the page's former direct ref assignment.
const open = computed({
	get: () => props.open,
	set: (value) => emit('update:open', value)
})
</script>

<template>
	<Dialog v-model:open="open">
		<DialogContent class="sm:max-w-lg">
			<DialogHeader>
				<DialogTitle>Save {{ stagedCount }} staged track changes?</DialogTitle>
				<DialogDescription>
					Evidence will be saved for every staged match. Only blank BPM and key
					values will be filled; populated values remain unchanged.
				</DialogDescription>
			</DialogHeader>

			<div
				class="border-border grid grid-cols-2 divide-x divide-y rounded-md border sm:grid-cols-4 sm:divide-y-0"
			>
				<div class="px-3 py-3 text-center">
					<div class="text-muted-foreground text-xs">Tracks</div>
					<div class="mt-1 text-xl font-semibold tabular-nums">
						{{ stagedCount }}
					</div>
				</div>
				<div class="px-3 py-3 text-center">
					<div class="text-muted-foreground text-xs">Evidence</div>
					<div class="mt-1 text-xl font-semibold tabular-nums">
						{{ stagedEvidenceCount }}
					</div>
					<div
						v-if="stagedEvidenceOnlyCount"
						class="text-muted-foreground mt-0.5 text-[10px]"
					>
						{{ stagedEvidenceOnlyCount }} only
					</div>
				</div>
				<div class="px-3 py-3 text-center">
					<div class="text-muted-foreground text-xs">BPM</div>
					<div class="mt-1 text-xl font-semibold tabular-nums">
						{{ stagedBpmCount }}
					</div>
				</div>
				<div class="px-3 py-3 text-center">
					<div class="text-muted-foreground text-xs">Keys</div>
					<div class="mt-1 text-xl font-semibold tabular-nums">
						{{ stagedKeyModeCount }}
					</div>
				</div>
			</div>

			<div class="text-muted-foreground flex items-start gap-2 text-sm">
				<ShieldCheck class="text-primary mt-0.5 size-4 shrink-0" />
				<span>Match details and source provenance will be retained.</span>
			</div>

			<div v-if="isApplying" class="flex flex-col gap-2">
				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">Saving changes</span>
					<span class="font-mono">{{ applyCompleted }} / {{ applyTotal }}</span>
				</div>
				<Progress :model-value="applyProgress" />
			</div>

			<DialogFooter class="gap-2">
				<Button variant="outline" :disabled="isApplying" @click="open = false">
					Back to review
				</Button>
				<ButtonLoading :loading="isApplying" @click="emit('confirm')">
					<Upload class="mr-2 size-4" />
					Save changes
				</ButtonLoading>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
