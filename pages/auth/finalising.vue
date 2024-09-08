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
	<div class="flex h-screen w-full items-center justify-center">
		<LoadingSpinner class="h-24 w-24 text-primary/30" />
	</div>
</template>
