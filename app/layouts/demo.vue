<script setup lang="ts">
await provideDemoWorkbench()
</script>

<template>
	<div class="contents">
		<ShellWorkbench>
			<slot />
		</ShellWorkbench>
		<DialogsWorkbench />
	</div>
</template>
