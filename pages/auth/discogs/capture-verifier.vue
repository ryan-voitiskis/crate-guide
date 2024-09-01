<script setup lang="ts">
const route = useRoute()
const discogs = useDiscogsStore()

onMounted(async () => {
	const oauth_token = route.query.oauth_token as string
	const oauth_verifier = route.query.oauth_verifier as string

	await discogs.getDiscogsAccessToken(oauth_token, oauth_verifier)
	navigateTo('/')
})
</script>

<template>
	<div class="w-full h-screen flex justify-center items-center">
		<LoadingSpinner class="w-24 h-24 text-primary/30" />
	</div>
</template>
