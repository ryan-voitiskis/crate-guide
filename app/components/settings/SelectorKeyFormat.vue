<script setup lang="ts">
const user = useUserStore()

const keyFormat = computed({
	get: () => user.currentKeyFormat,
	set: (value: string) => {
		if (!isKeyFormat(value)) return
		void user.updateKeyFormat(value)
	}
})
</script>

<template>
	<div class="space-y-3">
		<div class="space-y-1">
			<Label>Key format</Label>
			<p class="text-muted-foreground text-sm">
				Choose how musical keys are shown throughout the app.
			</p>
		</div>
		<RadioGroup
			v-model="keyFormat"
			class="grid max-w-md grid-cols-1 gap-2 sm:grid-cols-2"
		>
			<Label class="[&:has([data-state=checked])>div]:border-primary flex-col">
				<RadioGroupItem value="key" class="sr-only" />
				<div class="border-muted rounded-lg border p-3">
					<p class="text-sm font-medium">Standard</p>
					<p class="text-muted-foreground text-xs">G♯ / A♭ Major</p>
				</div>
			</Label>
			<Label class="[&:has([data-state=checked])>div]:border-primary flex-col">
				<RadioGroupItem value="camelot" class="sr-only" />
				<div class="border-muted rounded-lg border p-3">
					<p class="text-sm font-medium">Camelot</p>
					<p class="text-muted-foreground text-xs">4A / 8B</p>
				</div>
			</Label>
		</RadioGroup>
	</div>
</template>
