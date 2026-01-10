<script setup lang="ts">
import { FolderOpen } from 'lucide-vue-next'
</script>

<template>
	<div class="scrollbar-hidden flex-1 overflow-y-auto">
		<div class="mx-auto max-w-[1600px] p-2">
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<div class="bg-muted mb-4 rounded-full p-6">
					<FolderOpen class="text-muted-foreground size-12" />
				</div>
				<h3 class="mb-2 text-lg font-semibold">Demo Crates</h3>
				<p class="text-muted-foreground max-w-sm">
					See how to organize records into crates. Coming soon.
				</p>
			</div>
		</div>
	</div>
</template>
