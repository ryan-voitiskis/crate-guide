<script setup lang="ts">
const props = defineProps<{
	localOnly?: boolean
}>()

const user = useWorkbenchUserStore()
const localKeyFormat = ref<'key' | 'camelot'>(user.currentKeyFormat)

const keyFormat = computed({
	get: () => (props.localOnly ? localKeyFormat.value : user.currentKeyFormat),
	set: (value: string) => {
		if (!isKeyFormat(value)) return
		if (props.localOnly) {
			localKeyFormat.value = value
			return
		}
		void user.updateKeyFormat(value)
	}
})
</script>

<template>
	<div class="space-y-3">
		<div class="space-y-1">
			<Label>Key format</Label>
			<p class="text-muted-foreground text-xs">
				Choose how musical keys are shown throughout the app.
			</p>
		</div>
		<RadioGroup
			v-model="keyFormat"
			class="grid grid-cols-1 gap-2 sm:grid-cols-2"
		>
			<Label
				class="[&:has([data-state=checked])>div]:border-primary cursor-pointer flex-col"
			>
				<RadioGroupItem value="key" class="sr-only" />
				<div
					class="border-border hover:bg-muted/40 flex items-center justify-between rounded-sm border p-2.5 transition-colors"
				>
					<p class="text-xs font-medium">Standard</p>
					<p class="text-muted-foreground font-mono text-xs">G♯ / A♭</p>
				</div>
			</Label>
			<Label
				class="[&:has([data-state=checked])>div]:border-primary cursor-pointer flex-col"
			>
				<RadioGroupItem value="camelot" class="sr-only" />
				<div
					class="border-border hover:bg-muted/40 flex items-center justify-between rounded-sm border p-2.5 transition-colors"
				>
					<p class="text-xs font-medium">Camelot</p>
					<p class="text-muted-foreground font-mono text-xs">4A / 8B</p>
				</div>
			</Label>
		</RadioGroup>
	</div>
</template>
