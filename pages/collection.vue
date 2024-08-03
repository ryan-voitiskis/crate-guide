<script setup lang="ts">
const supabase = useSupabaseClient()

onMounted(async () => {
	const { data, error } = await supabase.from('records').select('*')
	console.log(data)
})
</script>

<template>
	<div>
		<h1>Collection</h1>
	</div>
</template>
