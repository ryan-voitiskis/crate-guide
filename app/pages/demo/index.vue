<script setup lang="ts">
import { Radio } from 'lucide-vue-next'
</script>

<template>
	<div class="scrollbar-hidden flex-1 overflow-y-auto">
		<div class="mx-auto max-w-[1600px] p-2">
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<div class="bg-muted mb-4 rounded-full p-6">
					<Radio class="text-muted-foreground size-12" />
				</div>
				<h3 class="mb-2 text-lg font-semibold">Demo Session</h3>
				<p class="text-muted-foreground max-w-sm">
					Experience the DJ session mode with sample data. Coming soon.
				</p>
			</div>
		</div>
	</div>
</template>
