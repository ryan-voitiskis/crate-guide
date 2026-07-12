<script setup lang="ts">
definePageMeta({ keepalive: false })

const user = useUserStore()
const router = useRouter()

watch(
	() => user.supaUser,
	(newUser) => {
		if (newUser) void router.replace('/')
	},
	{ immediate: true }
)
</script>

<template>
	<div class="flex h-screen w-full items-center justify-center">
		<SpinnerLoading class="text-primary/30 h-24 w-24" />
	</div>
</template>
