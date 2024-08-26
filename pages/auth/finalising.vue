<script setup lang="ts">
const user = useUserStore()
const router = useRouter()

watch(
	user.supaUser,
	() => {
		if (user.supaUser) router.push('/')
	},
	{ immediate: true }
)
</script>

<template>
	<div class="w-full h-screen flex justify-center items-center">
		<LoadingSpinner class="w-24 h-24 text-primary/30" />
	</div>
</template>
